import { attempt, hour } from "@sora/shared";

import { config } from "../../config";
import { InvalidStreamTokenError } from "../../errors";
import type { TimelineShift } from "../streams/align";
import { getRefinement } from "../subtitles/store";
import { rewritePlaylist } from "./playlist";
import { readSegment, rememberSegmentOrder } from "./readahead";
import { isDisguisedSegment, unwrapDisguisedSegment } from "./segment";
import { retimeWebVtt } from "./subtitle";
import { signStreamTarget, verifyStreamToken } from "./token";
import type { StreamTarget, StreamTargetKind } from "./token";
import { fetchUpstream, fetchUpstreamBytes, mirrorsFor, StreamUpstreamError } from "./upstream";
import type { UpstreamBytes } from "./upstream";

/**
 * How long tokens handed to clients stay valid.
 *
 * Long enough to finish a movie after pausing; short enough that a leaked
 * link stops working the same day.
 */
export const tokenLifetimeMs = 6 * hour;

/** Playlists are buffered for rewriting; anything larger is not a playlist. */
const maximumPlaylistBytes = 4 * 1024 * 1024;

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
		mirrors = [],
		shifts,
		refinement,
	}: {
		accountId: string;
		mirrors?: string[];
		shifts?: TimelineShift[];
		refinement?: string;
	},
) =>
	signStreamTarget(
		{
			accountId,
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

/** Whether the proxy could serve `url` right now, from its own host or a mirror. */
export const canFetchStream = async (
	url: string,
	headers: Record<string, string>,
	mirrors: string[],
	signal?: AbortSignal,
) => {
	const { data, error } = await attempt(
		fetchUpstream(
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
		return false;
	}
	await data.response.body?.cancel();
	return true;
};

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
		fetchUpstreamBytes(
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

/**
 * The start time of every segment of an HLS stream, in seconds; the first
 * variant's for a multivariant playlist.
 *
 * @throws {StreamUpstreamError} when a playlist cannot be fetched.
 */
export const segmentStarts = async (url: string, headers: Record<string, string>) => {
	const target = {
		accountId: "",
		expiresAt: 0,
		headers,
		kind: "playlist" as const,
		mirrors: [],
		url,
	};
	let upstream = await fetchUpstream(target, null);
	let content = await upstream.response.text();

	const variant = /#EXT-X-STREAM-INF[^\n]*\n\s*(?<uri>[^#\s][^\n]*)/u.exec(content)?.[1];
	if (variant) {
		const variantUrl = new URL(variant.trim(), upstream.url).toString();
		upstream = await fetchUpstream(
			{
				...target,
				mirrors: mirrorsFor(variantUrl, upstream.url),
				url: variantUrl,
			},
			null,
		);
		content = await upstream.response.text();
	}

	const starts: number[] = [];
	let elapsed = 0;
	for (const [, duration] of content.matchAll(/^#EXTINF:(?<duration>[\d.]+)/gmu)) {
		starts.push(elapsed);
		elapsed += Number(duration);
	}
	return starts;
};

const playlistResponse = (target: StreamTarget, upstream: UpstreamBytes) => {
	if (upstream.bytes.byteLength > maximumPlaylistBytes) {
		throw new StreamUpstreamError("Upstream playlist is too large", null);
	}

	const content = new TextDecoder().decode(upstream.bytes);
	if (!content.trimStart().startsWith("#EXTM3U")) {
		throw new StreamUpstreamError("Upstream did not return an HLS playlist", null);
	}

	// Children inherit the parent's headers and expiry, so a playlist cannot be
	// used to mint tokens that outlive the one the client was given.
	const segments: StreamTarget[] = [];
	const rewritten = rewritePlaylist(content, upstream.url, (url, kind) => {
		const child: StreamTarget = {
			accountId: target.accountId,
			expiresAt: target.expiresAt,
			headers: target.headers,
			kind,
			mirrors: mirrorsFor(url, upstream.url),
			url,
		};
		if (kind === "segment") {
			segments.push(child);
		}
		return signStreamTarget(child, config.streamSigningSecret);
	});
	rememberSegmentOrder(segments);

	return new Response(rewritten, {
		headers: {
			// Live playlists change; media playlists for VOD are cheap to refetch.
			"Cache-Control": "no-cache",
			"Content-Type": "application/vnd.apple.mpegurl",
		},
		status: 200,
	});
};

/**
 * Streams a segment through unchanged unless it starts with a disguising
 * image header, in which case it is buffered and the image removed.
 */
const segmentResponse = async (body: ReadableStream<Uint8Array>, headers: Headers) => {
	const reader = body.getReader();
	const first = await reader.read();
	if (first.done) {
		return new Response(null, {
			headers,
			status: 200,
		});
	}

	if (isDisguisedSegment(first.value)) {
		const chunks = [first.value];
		reader.releaseLock();
		for await (const chunk of body) {
			chunks.push(chunk);
		}

		const segment = unwrapDisguisedSegment(Buffer.concat(chunks));
		headers.set("Content-Type", "video/mp2t");
		headers.set("Content-Length", String(segment.byteLength));
		return new Response(segment, {
			headers,
			status: 200,
		});
	}

	return new Response(
		new ReadableStream<Uint8Array>({
			cancel(reason) {
				return reader.cancel(reason);
			},
			async pull(controller) {
				const chunk = await reader.read();
				if (chunk.done) {
					controller.close();
				} else {
					controller.enqueue(chunk.value);
				}
			},
			start(controller) {
				controller.enqueue(first.value);
			},
		}),
		{
			headers,
			status: 200,
		},
	);
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
	const target = verifyStreamToken(token, config.streamSigningSecret);
	if (target.accountId !== request.accountId) {
		throw new InvalidStreamTokenError("Stream token was issued to another account");
	}

	if (target.kind === "segment" && !request.range) {
		const segment = await readSegment(target);
		const headers = new Headers({
			"Cache-Control": "private, max-age=3600",
			"Content-Length": String(segment.bytes.byteLength),
		});
		if (segment.contentType) {
			headers.set("Content-Type", segment.contentType);
		}
		return new Response(segment.bytes, {
			headers,
			status: 200,
		});
	}

	if (target.kind === "playlist") {
		const upstream = await fetchUpstreamBytes(target, request.signal);
		return playlistResponse(target, upstream);
	}

	if (target.kind === "subtitle" || target.kind === "key") {
		const upstream = await fetchUpstreamBytes(target, request.signal);
		if (target.kind === "subtitle" && target.shifts) {
			const text = new TextDecoder().decode(upstream.bytes);
			const stored = target.refinement ? await getRefinement(target.refinement) : null;
			return new Response(retimeWebVtt(text, target.shifts, stored?.refinement?.anchors ?? []), {
				headers: {
					"Cache-Control": "private, max-age=3600",
					"Content-Type": "text/vtt; charset=utf-8",
				},
				status: 200,
			});
		}

		const headers = new Headers({
			"Cache-Control": "private, max-age=3600",
			"Content-Length": String(upstream.bytes.byteLength),
		});
		const contentType = upstream.headers.get("Content-Type");
		if (contentType) {
			headers.set("Content-Type", contentType);
		}

		// Hosts serve WebVTT as octet-stream, which browsers may refuse for <track>.
		if (target.kind === "subtitle" && new URL(target.url).pathname.endsWith(".vtt")) {
			headers.set("Content-Type", "text/vtt; charset=utf-8");
		}

		return new Response(upstream.bytes, {
			headers,
			status: 200,
		});
	}

	const upstream = await fetchUpstream(target, request.range, request.signal);

	const headers = new Headers({
		"Cache-Control": "private, max-age=3600",
	});
	for (const name of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
		const value = upstream.response.headers.get(name);
		if (value) {
			headers.set(name, value);
		}
	}

	// Some hosts disguise TS segments as images to pass CDN filters. Strict
	// players (AVPlayer, ExoPlayer) reject that type, so restore the real one.
	const contentType = headers.get("Content-Type");
	if (target.kind === "segment" && contentType && /^(?:image|text)\//iu.test(contentType)) {
		headers.set("Content-Type", "video/mp2t");
	}

	// A ranged response cannot be unwrapped without breaking its byte offsets.
	if (target.kind === "segment" && upstream.response.status === 200 && upstream.response.body) {
		return segmentResponse(upstream.response.body, headers);
	}

	return new Response(upstream.response.body, {
		headers,
		status: upstream.response.status,
	});
};
