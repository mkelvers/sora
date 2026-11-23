import { attempt, defined, second, sequence } from "@sora/shared";
import type { Attempt } from "@sora/shared";

import { Hops } from "./hops";
import type { Upstream, UpstreamBytes } from "./hops";
import type { StreamTarget } from "./token";
import { StreamUpstreamError } from "./upstream-error";

const defaultTimeoutMs = 15 * second;

/** Segments arrive at about the stream's bitrate from a cold host, so they get longer. */
const segmentTimeoutMs = 45 * second;

/** How long a host may go without answering before the next candidate also starts. */
const hedgeDelayMs = 1.5 * second;

/**
 * Fetches a target, falling back to its mirrors in order when the primary
 * host is unreachable or answers with an error.
 *
 * @throws {StreamUpstreamError} with the primary host's failure when
 *   every candidate fails.
 */
export const fetchTarget = async (
	target: StreamTarget,
	range: string | null,
	signal?: AbortSignal,
): Promise<Upstream> => {
	const headers = new Headers(target.headers);

	if (range) {
		headers.set("Range", range);
	}

	let timeoutMs = defaultTimeoutMs;

	if (target.kind === "segment") {
		timeoutMs = segmentTimeoutMs;
	}

	const hops = new Hops(headers, timeoutMs, signal);
	const primary = await attempt(hops.follow(target.url), StreamUpstreamError);

	if (!primary.error) {
		return primary.data;
	}

	const fallback = await sequence.first(target.mirrors, async (mirror) => {
		const result = await attempt(hops.follow(mirror), StreamUpstreamError);

		if (result.error) {
			return;
		}

		return result.data;
	});

	if (fallback) {
		return fallback;
	}

	// The primary host's failure is the one worth reporting.
	throw primary.error;
};

/**
 * Fetches a target's whole body, moving on to its mirrors when a host fails
 * or stalls.
 *
 * Hosts sometimes never answer, or send their headers and then never the
 * body, which only reading it shows. The next candidate starts once the
 * previous one fails, or after a while without headers or, once they came,
 * without another byte of the body, and the first to finish wins, so a
 * stalled host costs a few seconds instead of the whole timeout.
 *
 * @throws {StreamUpstreamError} with the primary host's failure when
 *   every candidate fails.
 */
export const readTarget = async (
	target: StreamTarget,
	signal?: AbortSignal,
): Promise<UpstreamBytes> => {
	/**
	 * How long a host that answered may go without sending a byte of a segment
	 * before the next candidate also starts. A host that keeps sending, however
	 * slowly, is left to finish.
	 */
	const segmentStallMs = 4 * second;

	const candidates = [target.url, ...target.mirrors];
	const headers = new Headers(target.headers);
	let timeoutMs = defaultTimeoutMs;
	let bodyHedgeMs = hedgeDelayMs;

	if (target.kind === "segment") {
		timeoutMs = segmentTimeoutMs;
		bodyHedgeMs = segmentStallMs;
	}

	const losers = new AbortController();
	const watched = [losers.signal];

	if (signal) {
		watched.unshift(signal);
	}

	const cancelled = AbortSignal.any(watched);
	const hops = new Hops(headers, timeoutMs, cancelled);

	const { promise, resolve, reject } = Promise.withResolvers<UpstreamBytes>();
	let launched = 0;
	let failed = 0;
	let settled = false;
	let hedge: ReturnType<typeof setTimeout> | undefined;
	let primaryFailure: unknown;

	const settle = async (read: Promise<Attempt<UpstreamBytes>>, retry: () => void) => {
		const { data, error } = await read;

		if (settled) {
			return;
		}

		if (!error) {
			settled = true;
			clearTimeout(hedge);
			losers.abort();
			resolve(data);

			return;
		}

		if (!(error instanceof StreamUpstreamError)) {
			settled = true;
			clearTimeout(hedge);
			losers.abort();
			reject(error);

			return;
		}

		primaryFailure ??= error;
		failed += 1;

		if (failed === candidates.length) {
			settled = true;
			clearTimeout(hedge);
			reject(primaryFailure);

			return;
		}

		retry();
	};

	const launch = () => {
		clearTimeout(hedge);

		if (settled || launched >= candidates.length) {
			return;
		}

		const candidate = defined(candidates[launched]);
		launched += 1;
		const position = launched;
		hedge = setTimeout(launch, hedgeDelayMs);

		const answered = () => {
			if (!settled && position === launched) {
				clearTimeout(hedge);
				hedge = setTimeout(launch, bodyHedgeMs);
			}
		};

		void settle(attempt(hops.read(candidate, target.kind, answered)), launch);
	};

	launch();

	return await promise;
};

/**
 * Proposes the playlist's own host as a mirror for a child URI on another host.
 *
 * Stream CDNs shard segments across many hostnames; individual shards are
 * often unreachable (dead, geo-blocked, or DNS-filtered) while the host that
 * served the playlist carries the same paths.
 */
export const mirrorsFor = (url: string, playlistUrl: string) => {
	const child = new URL(url);
	const parent = new URL(playlistUrl);

	if (child.host === parent.host) {
		return [];
	}

	return [new URL(`${child.pathname}${child.search}`, parent.origin).toString()];
};
