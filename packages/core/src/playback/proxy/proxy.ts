import { attempt, hour } from "@sora/shared";

import { config } from "../../config";
import { InvalidStreamTokenError } from "../../errors";
import type { TimelineShift } from "../streams/align";
import { rewrite } from "./playlist";
import { readahead } from "./readahead";
import { Resource } from "./resource";
import { signStreamTarget, verify } from "./token";
import type { StreamTarget, StreamTargetKind } from "./token";
import { fetchTarget, mirrorsFor, readTarget } from "./upstream";
import { StreamUpstreamError } from "./upstream-error";

/**
 * How long tokens handed to clients stay valid.
 *
 * Long enough to finish a movie after pausing; short enough that a leaked
 * link stops working the same day.
 */
export const tokenLifetimeMs = 6 * hour;

/**
 * Issues a token that lets an account fetch `url` through {@link proxyStream}.
 *
 * Clients never see the upstream URL or headers: the token is opaque and the
 * proxy applies them.
 */
export const createStreamToken = (
	url: string,
	kind: StreamTargetKind,
	headers: Record<string, string>,
	{
		accountId,
		audio,
		mirrors = [],
		shifts,
		refinement,
	}: {
		accountId: string;
		audio?: string;
		mirrors?: string[];
		shifts?: TimelineShift[];
		refinement?: string;
	},
) =>
	signStreamTarget(
		{
			accountId,
			audio,
			expiresAt: Math.floor((Date.now() + tokenLifetimeMs) / 1000),
			headers,
			kind,
			mirrors,
			refinement,
			shifts,
			url,
		},
		config.streamSigningSecret,
	);

/**
 * Whether the proxy could serve `url`, from its own host or a mirror. A host
 * answering 429 counts: it is up and throttling a burst, which requests for
 * the stream wait out (see `fetchTarget`).
 */
export const canFetchStream = async (
	url: string,
	headers: Record<string, string>,
	mirrors: string[],
	signal?: AbortSignal,
) => {
	const { data, error } = await attempt(
		fetchTarget(
			{
				accountId: "",
				expiresAt: 0,
				headers,
				kind: "subtitle",
				mirrors,
				url,
			},
			null,
			signal,
		),
		StreamUpstreamError,
	);

	if (error) {
		return error.status === 429;
	}

	await data.response.body?.cancel();

	return true;
};

/** An HLS playlist's text, and the URL it came from once redirects were followed. */
export interface Playlist {
	content: string;
	url: string;
}

/**
 * Reads an HLS playlist from its host, or from `mirrors` when it fails.
 *
 * Playback hands one reader that keeps what it read to everything that looks
 * at a stream, so a playlist the probe read is not fetched again to align a
 * dub or warm the stream.
 *
 * @throws {StreamUpstreamError} when no host serves it; a host throttling a
 *   burst for longer than is waited out fails with status 429.
 */
export type PlaylistReader = (
	url: string,
	headers: Record<string, string>,
	options?: {
		mirrors?: string[];
		signal?: AbortSignal;
	},
) => Promise<Playlist>;

/** Reads a playlist from upstream; see {@link PlaylistReader}. */
export const readPlaylist: PlaylistReader = async (url, headers, { mirrors = [], signal } = {}) => {
	const playlist = await readTarget(
		{
			accountId: "",
			expiresAt: 0,
			headers,
			kind: "playlist",
			mirrors,
			url,
		},
		signal,
	);

	return {
		content: new TextDecoder().decode(playlist.bytes),
		url: playlist.url,
	};
};

/** A playlist that may list variant streams, and how to read them. */
class Master {
	readonly #playlist: Playlist;
	readonly #headers: Record<string, string>;
	readonly #read: PlaylistReader;

	constructor(playlist: Playlist, headers: Record<string, string>, read: PlaylistReader) {
		this.#playlist = playlist;
		this.#headers = headers;
		this.#read = read;
	}

	/**
	 * The first variant, as it is read, or the playlist itself when it is a
	 * media playlist.
	 *
	 * @throws {StreamUpstreamError} when the variant cannot be read.
	 */
	first(): Promise<Playlist> {
		/** A multivariant playlist's first variant stream, by its URI. */
		const variantPattern = /#EXT-X-STREAM-INF[^\n]*\n\s*(?<uri>[^#\s][^\n]*)/u;

		const variant = variantPattern.exec(this.#playlist.content)?.groups?.uri;

		if (!variant) {
			return Promise.resolve(this.#playlist);
		}

		const variantUrl = new URL(variant.trim(), this.#playlist.url).toString();

		return this.#read(variantUrl, this.#headers, {
			mirrors: mirrorsFor(variantUrl, this.#playlist.url),
		});
	}
}

/**
 * A subtitle file's text, from its own host or a mirror.
 *
 * @returns `null` when neither can serve it right now.
 */
export const readSubtitle = async (
	url: string,
	headers: Record<string, string>,
	mirrors: string[],
) => {
	const { data, error } = await attempt(
		readTarget(
			{
				accountId: "",
				expiresAt: 0,
				headers,
				kind: "subtitle",
				mirrors,
				url,
			},
			undefined,
		),
		StreamUpstreamError,
	);

	if (error) {
		return null;
	}

	return new TextDecoder().decode(data.bytes);
};

/** Where an HLS stream's segments start, and how long it runs, in seconds. */
export interface StreamTimeline {
	starts: number[];
	/** `null` when the playlist lists no segments. */
	duration: number | null;
}

/**
 * The timeline of an HLS stream: the first variant's for a multivariant
 * playlist.
 *
 * @throws {StreamUpstreamError} when a playlist cannot be fetched.
 */
export const streamTimeline = async (
	url: string,
	headers: Record<string, string>,
	read: PlaylistReader = readPlaylist,
): Promise<StreamTimeline> => {
	const { content } = await new Master(await read(url, headers), headers, read).first();

	const starts: number[] = [];
	let elapsed = 0;

	for (const [, duration] of content.matchAll(/^#EXTINF:(?<duration>[\d.]+)/gmu)) {
		starts.push(elapsed);
		elapsed += Number(duration);
	}

	if (starts.length === 0) {
		return {
			duration: null,
			starts,
		};
	}

	return {
		duration: elapsed,
		starts,
	};
};

/**
 * Starts loading the first segments of a stream that is about to be played, so
 * that the player's first requests find them ready. Only a stream with a
 * single quality is warmed: with several, the player picks one, and a guess
 * would load segments nobody asks for. Failures are left to the player's own
 * requests.
 */
export const warmStream = async (
	url: string,
	headers: Record<string, string>,
	read: PlaylistReader = readPlaylist,
) => {
	/** How many segments of a stream are loaded before it is played, an init section counting as one. */
	const warmedSegments = 3;

	const variantsPattern = /#EXT-X-STREAM-INF[^\n]*\n\s*(?<uri>[^#\s][^\n]*)/gu;

	const { data: master, error } = await attempt(read(url, headers), StreamUpstreamError);

	if (error || [...master.content.matchAll(variantsPattern)].length > 1) {
		return;
	}

	const { data: playlist, error: variantFailure } = await attempt(
		new Master(master, headers, read).first(),
		StreamUpstreamError,
	);

	if (variantFailure) {
		return;
	}

	const segments: StreamTarget[] = [];
	rewrite(playlist.content, playlist.url, (segmentUrl, kind) => {
		if (kind === "segment") {
			segments.push({
				accountId: "",
				expiresAt: 0,
				headers,
				kind,
				mirrors: mirrorsFor(segmentUrl, playlist.url),
				url: segmentUrl,
			});
		}

		return segmentUrl;
	});
	readahead.warm(segments.slice(0, warmedSegments));
};

/**
 * Serves one proxied stream resource.
 *
 * Mount this so the token is the last path segment under a fixed prefix, for
 * example `GET /stream/:token`. Rewritten playlists reference their children
 * with bare relative tokens, which only resolve correctly under that layout.
 *
 * `Range` is forwarded so players can seek in progressive files.
 *
 * @throws {InvalidStreamTokenError} for a forged, malformed, or expired
 *   token, or one issued to another account.
 * @throws {StreamUpstreamError} when the upstream and its mirrors fail.
 */
export const proxyStream = async (
	token: string,
	request: {
		/** The signed-in account asking; the token must have been issued to it. */
		accountId: string;
		range: string | null;
		signal?: AbortSignal;
	},
): Promise<Response> => {
	const target = verify(token, config.streamSigningSecret);

	if (target.accountId !== request.accountId) {
		throw new InvalidStreamTokenError("Stream token was issued to another account");
	}

	const resource = new Resource(target);

	if (target.kind === "segment" && !request.range) {
		return await resource.whole();
	}

	if (target.kind === "playlist") {
		return await resource.playlist(request.signal);
	}

	if (target.kind === "subtitle" || target.kind === "key") {
		return await resource.small(request.signal);
	}

	return await resource.stream(request.range, request.signal);
};
