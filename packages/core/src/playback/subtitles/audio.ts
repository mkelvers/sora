import { attempt, second, defined, inSequence } from "@sora/shared";

import { unwrapDisguised } from "../proxy/segment";
import { readTarget, mirrorsFor } from "../proxy/upstream";

/** The audio or transcription tools could not do their part of refining subtitles. */
export class SubtitleRefinementError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "SubtitleRefinementError";
	}
}

/** The playlist listing a stream's segments: the lowest bitrate variant of a master playlist. */
export const mediaPlaylist = async (url: string, headers: Record<string, string>) => {
	const master = await readTarget({
		accountId: "",
		expiresAt: 0,
		headers,
		kind: "playlist",
		mirrors: [],
		url,
	});

	const text = new TextDecoder().decode(master.bytes);

	const variants = [
		...text.matchAll(/^#EXT-X-STREAM-INF:(?<attributes>[^\n]*)\n\s*(?<uri>[^#\s][^\n]*)/gmu),
	].map(([, attributes, uri]) => ({
		bandwidth: Number(
			/BANDWIDTH=(?<bandwidth>\d+)/u.exec(defined(attributes))?.[1] ?? Number.POSITIVE_INFINITY,
		),
		url: new URL(defined(uri).trim(), master.url).toString(),
	}));

	const [lowest] = variants.toSorted((a, b) => a.bandwidth - b.bandwidth);

	if (!lowest) {
		return {
			text,
			url: master.url,
		};
	}

	const media = await readTarget({
		accountId: "",
		expiresAt: 0,
		headers,
		kind: "playlist",
		mirrors: mirrorsFor(lowest.url, master.url),
		url: lowest.url,
	});

	return {
		text: new TextDecoder().decode(media.bytes),
		url: media.url,
	};
};

/** A segment's bytes, unwrapped from any image it is disguised as, tried a few times before failing. */
export const readWithRetries = async (
	url: string,
	playlistUrl: string,
	headers: Record<string, string>,
	tries = 1,
): Promise<Uint8Array> => {
	const attempts = 5;

	try {
		const upstream = await readTarget({
			accountId: "",
			expiresAt: 0,
			headers,
			kind: "segment",
			mirrors: mirrorsFor(url, playlistUrl),
			url,
		});

		return unwrapDisguised(upstream.bytes);
	} catch (error) {
		if (tries === attempts) {
			throw error;
		}

		await Bun.sleep(tries * 1.5 * second);

		return await readWithRetries(url, playlistUrl, headers, tries + 1);
	}
};

/**
 * Writes the audio of an HLS stream to a 16 kHz mono WAV file, the form
 * speech recognition takes, without writing the video to disk.
 *
 * The lowest bitrate variant is read, since its audio is the same as the
 * others' and costs the least to fetch. Each segment is unwrapped from the
 * image some hosts disguise it as and fed to ffmpeg in order.
 *
 * @param playlistUrl - The stream's master or media playlist.
 * @param path - Where to write the WAV file.
 * @throws {SubtitleRefinementError} when the stream is encrypted, a
 *   segment cannot be fetched, or ffmpeg fails.
 */
export const extract = async (
	playlistUrl: string,
	headers: Record<string, string>,
	path: string,
) => {
	/** Segments fetched at once; hosts that limit requests answer more with 429. */
	const concurrency = 3;

	/** How long ffmpeg may take to decode an episode's audio. */
	const decodeTimeoutMs = 20 * 60 * second;

	const media = await mediaPlaylist(playlistUrl, headers);

	if (/^#EXT-X-KEY:(?!METHOD=NONE)/mu.test(media.text)) {
		throw new SubtitleRefinementError("The stream is encrypted");
	}

	const initialization = /^#EXT-X-MAP:.*URI="(?<uri>[^"]+)"/mu.exec(media.text)?.[1];

	const uris = media.text
		.split(/\r?\n/u)
		.map((line) => line.trim())
		.filter((line) => line && !line.startsWith("#"));

	if (initialization) {
		uris.unshift(initialization);
	}

	const segments = uris.map((uri) => new URL(uri, media.url).toString());

	if (segments.length === 0) {
		throw new SubtitleRefinementError("The playlist has no segments");
	}

	const ffmpeg = Bun.spawn(
		["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-y", path],
		{
			stderr: "pipe",
			stdin: "pipe",
			stdout: "ignore",
			timeout: decodeTimeoutMs,
		},
	);

	const failure = new Response(ffmpeg.stderr).text();

	try {
		const fetching = new Map<number, Promise<Uint8Array>>();

		const fetchSegment = (index: number) => {
			const promise =
				fetching.get(index) ?? readWithRetries(defined(segments[index]), media.url, headers);

			fetching.set(index, promise);

			return promise;
		};

		await inSequence([...segments.keys()], async (index) => {
			for (let ahead = index; ahead < Math.min(segments.length, index + concurrency); ahead += 1) {
				// A failed fetch ahead is awaited, and so reported, when its turn comes.
				attempt(fetchSegment(ahead));
			}

			ffmpeg.stdin.write(await fetchSegment(index));
			await ffmpeg.stdin.flush();
			fetching.delete(index);
		});
		await ffmpeg.stdin.end();
	} catch (error) {
		ffmpeg.kill();
		throw new SubtitleRefinementError(`Could not read the stream's audio: ${await failure}`, {
			cause: error,
		});
	}

	if ((await ffmpeg.exited) !== 0) {
		throw new SubtitleRefinementError(`ffmpeg failed: ${await failure}`);
	}
};
