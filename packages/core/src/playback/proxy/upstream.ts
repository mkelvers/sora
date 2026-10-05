import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

import { attempt, type Attempt } from "@sora/shared";

import { CoreError, InvalidStreamTokenError } from "../../errors";
import { second } from "../../time";
import { isBareImage } from "./segment";
import type { StreamTarget, StreamTargetKind } from "./token";

const upstreamTimeoutMs = 15 * second;

/** Segments arrive at about the stream's bitrate from a cold host, so they get longer. */
const segmentTimeoutMs = 45 * second;

/** How long a host may go without answering before the next candidate also starts. */
const hedgeDelayMs = 1.5 * second;

/** How long a host that answered may take to send a segment before the next candidate also starts. */
const segmentHedgeMs = 12 * second;
const maximumRedirects = 5;

/** The proxied upstream could not be fetched. Retryable. */
export class StreamUpstreamError extends CoreError {
	readonly status: number | null;

	constructor(message: string, status: number | null, options?: ErrorOptions) {
		super("UPSTREAM_UNAVAILABLE", message, options);
		this.status = status;
	}
}

/** A successful upstream response. */
export interface Upstream {
	response: Response;
	/** Final URL after redirects, used to resolve relative playlist URIs. */
	url: string;
}

/**
 * Fetches a target, falling back to its mirrors in order when the primary
 * host is unreachable or answers with an error.
 *
 * @throws {@link StreamUpstreamError} with the primary host's failure when
 *   every candidate fails.
 */
export async function fetchUpstream(
	target: StreamTarget,
	range: string | null,
	signal?: AbortSignal,
): Promise<Upstream> {
	const headers = new Headers(target.headers);
	if (range) {
		headers.set("Range", range);
	}

	const timeoutMs = target.kind === "segment" ? segmentTimeoutMs : upstreamTimeoutMs;

	const primary = await attempt(
		fetchFollowingRedirects(target.url, headers, timeoutMs, signal),
		StreamUpstreamError,
	);
	if (!primary.error) {
		return primary.data;
	}

	for (const mirror of target.mirrors) {
		const fallback = await attempt(
			fetchFollowingRedirects(mirror, headers, timeoutMs, signal),
			StreamUpstreamError,
		);
		if (!fallback.error) {
			return fallback.data;
		}
	}

	// The primary host's failure is the one worth reporting.
	throw primary.error;
}

/** A whole upstream body, read before any candidate host is trusted. */
export interface UpstreamBytes {
	bytes: Uint8Array<ArrayBuffer>;
	headers: Headers;
	/** Final URL after redirects, used to resolve relative playlist URIs. */
	url: string;
}

/**
 * Fetches a target's whole body, moving on to its mirrors when a host fails
 * or stalls.
 *
 * Hosts sometimes never answer, or send their headers and then never the
 * body, which only reading it shows. The next candidate starts once the
 * previous one fails, or after a while without headers or, once they came,
 * without the whole body, and the first to finish wins, so a stalled host
 * costs a few seconds instead of the whole timeout.
 *
 * @throws {@link StreamUpstreamError} with the primary host's failure when
 *   every candidate fails.
 */
export async function fetchUpstreamBytes(
	target: StreamTarget,
	signal?: AbortSignal,
): Promise<UpstreamBytes> {
	const candidates = [target.url, ...target.mirrors];
	const headers = new Headers(target.headers);
	const timeoutMs = target.kind === "segment" ? segmentTimeoutMs : upstreamTimeoutMs;
	const bodyHedgeMs = target.kind === "segment" ? segmentHedgeMs : hedgeDelayMs;
	const losers = new AbortController();
	const cancelled = AbortSignal.any(signal ? [signal, losers.signal] : [losers.signal]);

	return new Promise((resolve, reject) => {
		let launched = 0;
		let failed = 0;
		let settled = false;
		let hedge: ReturnType<typeof setTimeout> | undefined;
		let primaryFailure: unknown;

		const launch = () => {
			clearTimeout(hedge);
			if (settled || launched >= candidates.length) {
				return;
			}

			const candidate = candidates[launched]!;
			launched += 1;
			const position = launched;
			hedge = setTimeout(launch, hedgeDelayMs);

			const answered = () => {
				if (!settled && position === launched) {
					clearTimeout(hedge);
					hedge = setTimeout(launch, bodyHedgeMs);
				}
			};

			void settle(
				attempt(readCandidate(candidate, target.kind, headers, timeoutMs, cancelled, answered)),
			);
		};

		const settle = async (read: Promise<Attempt<UpstreamBytes>>) => {
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
			launch();
		};

		launch();
	});
}

async function readCandidate(
	url: string,
	kind: StreamTargetKind,
	headers: Headers,
	timeoutMs: number,
	signal: AbortSignal,
	answered: () => void,
): Promise<UpstreamBytes> {
	const upstream = await fetchFollowingRedirects(url, headers, timeoutMs, signal);
	answered();

	const body = await attempt(upstream.response.arrayBuffer());
	if (body.error) {
		throw new StreamUpstreamError(`Upstream ${new URL(url).host} stopped sending`, null, {
			cause: body.error,
		});
	}
	const bytes = new Uint8Array(body.data);

	// Stalling hosts sometimes close the connection instead, which reads as an empty body.
	if (bytes.byteLength === 0) {
		throw new StreamUpstreamError(`Upstream ${new URL(url).host} sent nothing`, null);
	}

	// Blocked hosts answer with an image of their own, often through a redirect.
	if (kind === "segment" && isBareImage(bytes)) {
		throw new StreamUpstreamError(
			`Upstream ${new URL(url).host} sent an image, not a segment`,
			null,
		);
	}

	return {
		bytes,
		headers: upstream.response.headers,
		url: upstream.url,
	};
}

/**
 * Proposes the playlist's own host as a mirror for a child URI on another host.
 *
 * Stream CDNs shard segments across many hostnames; individual shards are
 * often unreachable (dead, geo-blocked, or DNS-filtered) while the host that
 * served the playlist carries the same paths.
 */
export function mirrorsFor(url: string, playlistUrl: string) {
	const child = new URL(url);
	const parent = new URL(playlistUrl);
	if (child.host === parent.host) {
		return [];
	}

	return [new URL(`${child.pathname}${child.search}`, parent.origin).toString()];
}

async function fetchFollowingRedirects(
	start: string,
	headers: Headers,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<Upstream> {
	let url = start;

	for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
		await assertPublicHttpUrl(url);

		const { data, error } = await attempt(
			fetch(url, {
				headers,
				redirect: "manual",
				signal: signal
					? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
					: AbortSignal.timeout(timeoutMs),
			}),
		);
		if (error) {
			throw new StreamUpstreamError(`Upstream ${new URL(url).host} could not be reached`, null, {
				cause: error,
			});
		}

		const location = data.headers.get("Location");
		if (data.status >= 300 && data.status < 400 && location) {
			// Each hop is re-checked, so a redirect cannot reach a private address.
			url = new URL(location, url).toString();
			continue;
		}

		if (!data.ok) {
			throw new StreamUpstreamError(
				`Upstream ${new URL(url).host} returned ${data.status}`,
				data.status,
			);
		}

		return {
			response: data,
			url,
		};
	}

	throw new StreamUpstreamError("Upstream stream redirected too many times", null);
}

/** How long a host's addresses stay vetted, so a stream's many segments cost one lookup. */
const vettedFor = 60 * second;
const vettedHosts = new Map<string, number>();

/** Whether an IP address is loopback, private, link-local, reserved, or multicast. */
function isPrivateAddress(address: string) {
	const version = isIP(address);
	if (version === 4) {
		return /^(0|10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168|192\.0\.0|198\.1[89]|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])|22[4-9]|2[3-5]\d)\./.test(
			address,
		);
	}

	return version === 6 && /^(::1?$|f[cd]|fe[89ab]|ff|::ffff:)/i.test(address);
}

/**
 * Rejects URLs the proxy must never fetch: non-HTTP schemes, loopback, and
 * private or link-local addresses, whether written as an IP or a hostname
 * that resolves to one.
 *
 * Tokens are signed, but playlist URIs come from third-party servers, so a
 * hostile playlist could otherwise point the proxy at internal services.
 * The check resolves a hostname before the fetch resolves it again, so a
 * server that changes its answer in between (DNS rebinding) is not fully
 * stopped; the vetted result is kept for {@link vettedFor} to bound that.
 *
 * @throws {@link InvalidStreamTokenError} for a URL written as a non-public
 *   address or scheme.
 * @throws {@link StreamUpstreamError} when a hostname does not resolve or
 *   resolves to a non-public address, as sinkholed shards do, so the next
 *   mirror can be tried.
 */
async function assertPublicHttpUrl(value: string) {
	const url = new URL(value);
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new InvalidStreamTokenError("Stream target must use HTTP");
	}

	const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
	if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
		throw new InvalidStreamTokenError("Stream target is not a public host");
	}

	if (isIP(host)) {
		if (isPrivateAddress(host)) {
			throw new InvalidStreamTokenError("Stream target is not a public host");
		}
		return;
	}

	const vetted = vettedHosts.get(host);
	if (vetted !== undefined && vetted > Date.now()) {
		return;
	}

	const { data, error } = await attempt(
		lookup(host, {
			all: true,
		}),
	);
	if (error) {
		throw new StreamUpstreamError(`Upstream ${host} could not be resolved`, null, {
			cause: error,
		});
	}
	if (data.some(({ address }) => isPrivateAddress(address))) {
		throw new StreamUpstreamError(`Upstream ${host} resolves to a private address`, null);
	}

	if (vettedHosts.size > 1_000) {
		vettedHosts.clear();
	}
	vettedHosts.set(host, Date.now() + vettedFor);
}
