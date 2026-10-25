import { attempt } from "@sora/shared";

import { isDisguisedSegment, unwrapDisguisedSegment } from "./segment";
import type { StreamTarget } from "./token";
import { fetchUpstreamBytes, StreamUpstreamError } from "./upstream";

/**
 * How many segments past the one being played are fetched ahead of time.
 *
 * Stream hosts serve segments they have not served before at roughly the
 * bitrate of the stream itself, and a player asks for one segment at a time,
 * so it can never get ahead. Parallel requests add up, so fetching a window
 * of upcoming segments together lets playback outrun the host.
 */
const segmentsAhead = 32;

/** Segments kept in memory, oldest dropped first. */
const cacheBudgetBytes = 256 * 1024 * 1024;

/**
 * What a segment still being fetched ahead counts for against the budget, since
 * its size is not known until it arrives.
 */
const expectedSegmentBytes = 8 * 1024 * 1024;

/** Playlists whose segment order is remembered, oldest dropped first. */
const rememberedSegments = 20_000;

/** A segment ready to send, with any disguise already removed. */
interface Segment {
	bytes: Uint8Array<ArrayBuffer>;
	contentType: string | null;
}

interface Position {
	targets: StreamTarget[];
	index: number;
}

const positions = new Map<string, Position>();
const segments = new Map<string, Promise<Segment>>();
const sizes = new Map<string, number>();
let cachedBytes = 0;
let fetchingAhead = 0;

/**
 * Remembers the order of a media playlist's segments, so that serving one
 * can start fetching the ones after it.
 */
export const rememberSegmentOrder = (targets: StreamTarget[]) => {
	targets.forEach((target, index) => {
		positions.delete(target.url);
		positions.set(target.url, {
			index,
			targets,
		});
	});

	for (const url of positions.keys()) {
		if (positions.size <= rememberedSegments) {
			break;
		}
		positions.delete(url);
	}
};

const download = async (target: StreamTarget): Promise<Segment> => {
	const { bytes: body, headers } = await fetchUpstreamBytes(target);
	const disguised = isDisguisedSegment(body);
	const contentType = headers.get("Content-Type");

	return {
		bytes: disguised ? unwrapDisguisedSegment(body) : body,
		// Strict players (AVPlayer, ExoPlayer) reject the image type disguised
		// segments arrive with, so restore the real one.
		contentType:
			disguised || (contentType && /^(image|text)\//iu.test(contentType))
				? "video/mp2t"
				: contentType,
	};
};

const evict = (keep: string) => {
	for (const url of segments.keys()) {
		if (cachedBytes <= cacheBudgetBytes) {
			break;
		}

		const size = sizes.get(url);
		if (url === keep || size === undefined) {
			continue;
		}

		segments.delete(url);
		sizes.delete(url);
		cachedBytes -= size;
	}
};

const load = (target: StreamTarget) => {
	const cached = segments.get(target.url);
	if (cached) {
		segments.delete(target.url);
		segments.set(target.url, cached);
		return cached;
	}

	const pending = download(target);
	segments.set(target.url, pending);
	pending.then(
		(segment) => {
			if (segments.get(target.url) !== pending) {
				return;
			}
			sizes.set(target.url, segment.bytes.byteLength);
			cachedBytes += segment.bytes.byteLength;
			evict(target.url);
		},
		() => {
			if (segments.get(target.url) === pending) {
				segments.delete(target.url);
			}
		},
	);
	return pending;
};

/**
 * Loads a segment before the player asks for it, unless it is already loading
 * or the budget has no room for another. An upstream failure is left for the
 * player's own request, which tries again.
 */
const loadAhead = async (target: StreamTarget) => {
	if (
		segments.has(target.url) ||
		cachedBytes + fetchingAhead * expectedSegmentBytes > cacheBudgetBytes
	) {
		return;
	}

	fetchingAhead += 1;
	const { error } = await attempt(load(target));
	fetchingAhead -= 1;
	if (error && !(error instanceof StreamUpstreamError)) {
		console.error(`Fetching ${target.url} ahead failed: ${error.message}`);
	}
};

const fetchAhead = (target: StreamTarget) => {
	const position = positions.get(target.url);
	if (!position) {
		return;
	}

	for (const next of position.targets.slice(
		position.index + 1,
		position.index + 1 + segmentsAhead,
	)) {
		void loadAhead(next);
	}
};

/**
 * Serves a whole segment from memory when it was fetched ahead, otherwise
 * fetches it, and starts fetching the segments that follow.
 *
 * Fetches are shared between callers and are not tied to any one request, so
 * a player that gives up on a segment does not cancel what others wait for.
 *
 * @throws {@link StreamUpstreamError} when the upstream and its mirrors fail.
 */
export const readSegment = async (target: StreamTarget) => {
	const segment = load(target);
	fetchAhead(target);
	return segment;
};
