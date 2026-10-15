import { second } from "@sora/shared";

import { unwrapDisguisedSegment } from "../proxy/segment";
import type { StreamTarget } from "../proxy/token";
import { fetchUpstreamBytes, mirrorsFor } from "../proxy/upstream";

/** The audio or transcription tools could not do their part of refining subtitles. */
export class SubtitleRefinementError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = "SubtitleRefinementError";
	}
}

/** Segments fetched at once; hosts that limit requests answer more with 429. */
const concurrency = 3;
const attempts = 5;
/** How long ffmpeg may take to decode an episode's audio. */
const decodeTimeoutMs = 20 * 60 * second;

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
 * @throws {@link SubtitleRefinementError} when the stream is encrypted, a
 *   segment cannot be fetched, or ffmpeg fails.
 */
export async function extractAudio(
	playlistUrl: string,
	headers: Record<string, string>,
	path: string,
) {
	const media = await mediaPlaylist(playlistUrl, headers);
	if (/^#EXT-X-KEY:(?!METHOD=NONE)/m.test(media.text)) {
		throw new SubtitleRefinementError("The stream is encrypted");
	}

	const initialization = /^#EXT-X-MAP:.*URI="([^"]+)"/m.exec(media.text)?.[1];
	const segments = [
		...(initialization ? [initialization] : []),
		...media.text
			.split(/\r?\n/)
			.map((line) => line.trim())
			.filter((line) => line && !line.startsWith("#")),
	].map((uri) => new URL(uri, media.url).toString());
	if (segments.length === 0) {
		throw new SubtitleRefinementError("The playlist has no segments");
	}

	const ffmpeg = Bun.spawn(
		["ffmpeg", "-loglevel", "error", "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-y", path],
		{
			stdin: "pipe",
			stdout: "ignore",
			stderr: "pipe",
			timeout: decodeTimeoutMs,
		},
	);
	const failure = new Response(ffmpeg.stderr).text();

	try {
		const fetching = new Map<number, Promise<Uint8Array>>();
		const fetchSegment = (index: number) => {
			const promise = fetching.get(index) ?? readWithRetries(segments[index]!, media.url, headers);
			fetching.set(index, promise);
			return promise;
		};

		for (let index = 0; index < segments.length; index += 1) {
			for (let ahead = index; ahead < Math.min(segments.length, index + concurrency); ahead += 1) {
				// A failed fetch ahead is awaited, and so reported, when its turn comes.
				void fetchSegment(ahead).catch(() => undefined);
			}

			ffmpeg.stdin.write(await fetchSegment(index));
			await ffmpeg.stdin.flush();
			fetching.delete(index);
		}
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
}

/** The playlist listing a stream's segments: the lowest bitrate variant of a master playlist. */
async function mediaPlaylist(url: string, headers: Record<string, string>) {
	const master = await readPlaylist(url, headers);
	const variants = [
		...master.text.matchAll(/^#EXT-X-STREAM-INF:([^\n]*)\n\s*([^#\s][^\n]*)/gm),
	].map(([, attributes, uri]) => ({
		bandwidth: Number(/BANDWIDTH=(\d+)/.exec(attributes!)?.[1] ?? Number.POSITIVE_INFINITY),
		url: new URL(uri!.trim(), master.url).toString(),
	}));
	const lowest = variants.toSorted((a, b) => a.bandwidth - b.bandwidth)[0];
	return lowest ? readPlaylist(lowest.url, headers, master.url) : master;
}

async function readPlaylist(url: string, headers: Record<string, string>, parent?: string) {
	const upstream = await fetchUpstreamBytes(target(url, "playlist", headers, parent));
	return {
		text: new TextDecoder().decode(upstream.bytes),
		url: upstream.url,
	};
}

async function readWithRetries(url: string, playlistUrl: string, headers: Record<string, string>) {
	for (let attempt = 1; ; attempt += 1) {
		try {
			const upstream = await fetchUpstreamBytes(target(url, "segment", headers, playlistUrl));
			return unwrapDisguisedSegment(upstream.bytes);
		} catch (error) {
			if (attempt === attempts) {
				throw error;
			}
			await Bun.sleep(attempt * 1.5 * second);
		}
	}
}

function target(
	url: string,
	kind: StreamTarget["kind"],
	headers: Record<string, string>,
	parent?: string,
): StreamTarget {
	return {
		url,
		kind,
		headers,
		mirrors: parent ? mirrorsFor(url, parent) : [],
		accountId: "",
		expiresAt: 0,
	};
}
