import { attempt } from "@sora/shared";

import { Download } from "./download";
import type { Segment } from "./download";
import type { StreamTarget } from "./token";
import { StreamUpstreamError } from "./upstream-error";

/** Segments kept in memory, oldest dropped first. */
const cacheBudgetBytes = 256 * 1024 * 1024;

interface Position {
	targets: StreamTarget[];
	index: number;
}

/**
 * Segments fetched ahead of the player and kept in memory within
 * {@link cacheBudgetBytes}, and the order of the playlists they belong to.
 */
class Readahead {
	readonly #positions = new Map<string, Position>();
	readonly #segments = new Map<string, Promise<Segment>>();
	readonly #sizes = new Map<string, number>();
	#cachedBytes = 0;
	#fetchingAhead = 0;

	/**
	 * Remembers the order of a media playlist's segments, so that serving one
	 * can start fetching the ones after it.
	 */
	remember(targets: StreamTarget[]) {
		/** Playlists whose segment order is remembered, oldest dropped first. */
		const rememberedSegments = 20_000;

		for (const [index, target] of targets.entries()) {
			this.#positions.delete(target.url);
			this.#positions.set(target.url, {
				index,
				targets,
			});
		}

		for (const url of this.#positions.keys()) {
			if (this.#positions.size <= rememberedSegments) {
				break;
			}

			this.#positions.delete(url);
		}
	}

	/**
	 * Loads segments before anyone has asked for them, such as the first ones of
	 * a stream about to be played. Only what the budget has room for is loaded.
	 */
	warm(targets: StreamTarget[]) {
		for (const target of targets) {
			void this.#loadAhead(target);
		}
	}

	/**
	 * Serves a whole segment from memory when it was fetched ahead, otherwise
	 * fetches it, and starts fetching the segments that follow.
	 *
	 * Fetches are shared between callers and are not tied to any one request, so
	 * a player that gives up on a segment does not cancel what others wait for.
	 *
	 * @throws {StreamUpstreamError} when the upstream and its mirrors fail.
	 */
	async read(target: StreamTarget) {
		const segment = this.#load(target);
		this.#fetchAhead(target);

		return await segment;
	}

	#evict(keep: string) {
		for (const url of this.#segments.keys()) {
			if (this.#cachedBytes <= cacheBudgetBytes) {
				break;
			}

			const size = this.#sizes.get(url);

			if (url === keep || size === undefined) {
				continue;
			}

			this.#segments.delete(url);
			this.#sizes.delete(url);
			this.#cachedBytes -= size;
		}
	}

	#load(target: StreamTarget) {
		const cached = this.#segments.get(target.url);

		if (cached) {
			this.#segments.delete(target.url);
			this.#segments.set(target.url, cached);

			return cached;
		}

		const pending = new Download(target).segment();
		this.#segments.set(target.url, pending);
		attempt(this.#track(target, pending));

		return pending;
	}

	/** Counts a loaded segment against the budget, or forgets one that failed. */
	async #track(target: StreamTarget, pending: Promise<Segment>) {
		const { data: segment, error } = await attempt(pending);

		if (error) {
			if (this.#segments.get(target.url) === pending) {
				this.#segments.delete(target.url);
			}

			return;
		}

		if (this.#segments.get(target.url) !== pending) {
			return;
		}

		this.#sizes.set(target.url, segment.bytes.byteLength);
		this.#cachedBytes += segment.bytes.byteLength;
		this.#evict(target.url);
	}

	/**
	 * Loads a segment before the player asks for it, unless it is already loading
	 * or the budget has no room for another. An upstream failure is left for the
	 * player's own request, which tries again.
	 */
	async #loadAhead(target: StreamTarget) {
		/**
		 * What a segment still being fetched ahead counts for against the budget, since
		 * its size is not known until it arrives.
		 */
		const expectedSegmentBytes = 8 * 1024 * 1024;

		const full = this.#cachedBytes + this.#fetchingAhead * expectedSegmentBytes > cacheBudgetBytes;

		if (this.#segments.has(target.url) || full) {
			return;
		}

		this.#fetchingAhead += 1;
		const { error } = await attempt(this.#load(target));
		this.#fetchingAhead -= 1;

		if (error && !(error instanceof StreamUpstreamError)) {
			console.error(`Fetching ${target.url} ahead failed: ${error.message}`);
		}
	}

	#fetchAhead(target: StreamTarget) {
		/**
		 * How many segments past the one being played are fetched ahead of time.
		 *
		 * Stream hosts serve segments they have not served before at roughly the
		 * bitrate of the stream itself, and a player asks for one segment at a time,
		 * so it can never get ahead. Parallel requests add up, so fetching a window
		 * of upcoming segments together lets playback outrun the host.
		 */
		const segmentsAhead = 32;

		const position = this.#positions.get(target.url);

		if (!position) {
			return;
		}

		for (const next of position.targets.slice(
			position.index + 1,
			position.index + 1 + segmentsAhead,
		)) {
			void this.#loadAhead(next);
		}
	}
}

export const readahead = new Readahead();
