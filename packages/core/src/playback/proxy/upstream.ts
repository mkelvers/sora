import { lookup } from "node:dns";
import type { LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { Readable } from "node:stream";

import { attempt, second } from "@sora/shared";
import type { Attempt } from "@sora/shared";

import { CoreError, InvalidStreamTokenError } from "../../errors";
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

/**
 * The most a body read in full may hold, by what it is. A host that sends
 * more is not serving that, and reading on would fill memory until the
 * timeout. A file is streamed, never read in full, so it has no limit.
 */
const maximumBodyBytes: Record<StreamTargetKind, number> = {
	file: Number.POSITIVE_INFINITY,
	key: 64 * 1_024,
	playlist: 4 * 1_024 * 1_024,
	segment: 32 * 1_024 * 1_024,
	subtitle: 4 * 1_024 * 1_024,
};

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

/** Whether an IP address is loopback, private, link-local, reserved, or multicast. */
const isPrivateAddress = (address: string) => {
	const version = isIP(address);
	if (version === 4) {
		return /^(0|10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168|192\.0\.0|198\.1[89]|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])|22[4-9]|2[3-5]\d)\./.test(
			address,
		);
	}

	return version === 6 && /^(::1?$|f[cd]|fe[89ab]|ff|::ffff:)/i.test(address);
};

/**
 * Rejects URLs the proxy must never fetch: non-HTTP schemes, loopback, and
 * private or link-local IP literals. Hostnames are vetted when the
 * connection is made; see {@link requestPublicHost}.
 *
 * Tokens are signed, but playlist URIs come from third-party servers, so a
 * hostile playlist could otherwise point the proxy at internal services.
 *
 * @throws {@link InvalidStreamTokenError} for a URL that is not public.
 */
const assertPublicHttpUrl = (value: string) => {
	const url = new URL(value);
	if (url.protocol !== "https:" && url.protocol !== "http:") {
		throw new InvalidStreamTokenError("Stream target must use HTTP");
	}

	const host = url.hostname.replaceAll(/^\[|\]$/g, "").toLowerCase();
	if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
		throw new InvalidStreamTokenError("Stream target is not a public host");
	}

	if (isIP(host) && isPrivateAddress(host)) {
		throw new InvalidStreamTokenError("Stream target is not a public host");
	}
};

/**
 * Resolves a hostname for a connection, refusing when any of its addresses
 * is not public. The connection uses these very addresses, so a server that
 * answers a name with a public address first and a private one next (DNS
 * rebinding) cannot steer it.
 */
const publicLookup: typeof lookup = ((
	host: string,
	options: { all?: boolean },
	callback: (error: Error | null, address?: string | LookupAddress[], family?: number) => void,
) => {
	lookup(
		host,
		{
			...options,
			all: true,
		},
		(error, addresses) => {
			if (error) {
				callback(error);
				return;
			}
			if (addresses.some(({ address }) => isPrivateAddress(address))) {
				callback(new InvalidStreamTokenError("Stream target is not a public host"));
				return;
			}

			if (options.all) {
				callback(null, addresses);
				return;
			}
			callback(null, addresses[0]!.address, addresses[0]!.family);
		},
	);
}) as typeof lookup;

/**
 * Makes one request without following redirects, like `fetch(url, { redirect:
 * "manual" })`, but connecting only to public addresses.
 */
const requestPublicHost = (
	url: string,
	headers: Headers,
	signal: AbortSignal,
): Promise<Response> => {
	return new Promise((resolve, reject) => {
		const target = new URL(url);
		const outgoing = Object.fromEntries(headers);
		const send = target.protocol === "https:" ? https.request : http.request;

		const request = send(
			target,
			{
				headers: {
					Accept: "*/*",
					"Accept-Encoding": "identity",
					"User-Agent": `Bun/${Bun.version}`,
					...outgoing,
				},
				lookup: publicLookup,
				signal,
			},
			(incoming) => {
				const received = new Headers();
				for (const [name, value] of Object.entries(incoming.headers)) {
					for (const each of Array.isArray(value) ? value : [value]) {
						if (each !== undefined) {
							received.append(name, each);
						}
					}
				}

				const status = incoming.statusCode ?? 502;
				const empty = status === 204 || status === 205 || status === 304;
				resolve(
					new Response(empty ? null : (Readable.toWeb(incoming) as unknown as ReadableStream), {
						headers: received,
						status,
						statusText: incoming.statusMessage,
					}),
				);
			},
		);
		request.on("error", reject);
		request.end();
	});
};

const fetchFollowingRedirects = async (
	start: string,
	headers: Headers,
	timeoutMs: number,
	signal?: AbortSignal,
): Promise<Upstream> => {
	let url = start;

	for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
		assertPublicHttpUrl(url);

		const { data, error } = await attempt(
			requestPublicHost(
				url,
				headers,
				signal
					? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
					: AbortSignal.timeout(timeoutMs),
			),
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
};

/**
 * Fetches a target, falling back to its mirrors in order when the primary
 * host is unreachable or answers with an error.
 *
 * @throws {@link StreamUpstreamError} with the primary host's failure when
 *   every candidate fails.
 */
export const fetchUpstream = async (
	target: StreamTarget,
	range: string | null,
	signal?: AbortSignal,
): Promise<Upstream> => {
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
};

/** A whole upstream body, read before any candidate host is trusted. */
export interface UpstreamBytes {
	bytes: Uint8Array<ArrayBuffer>;
	headers: Headers;
	/** Final URL after redirects, used to resolve relative playlist URIs. */
	url: string;
}

/**
 * Reads a response's whole body, giving up as soon as it passes `maximumBytes`.
 *
 * @throws {@link StreamUpstreamError} when the body is larger than `maximumBytes`.
 */
export const readBounded = async (response: Response, maximumBytes: number) => {
	if (Number(response.headers.get("Content-Length")) > maximumBytes) {
		await response.body?.cancel();
		throw new StreamUpstreamError(`Upstream body is larger than ${maximumBytes} bytes`, null);
	}

	const chunks: Uint8Array[] = [];
	let total = 0;
	const reader = response.body?.getReader();
	while (reader) {
		const chunk = await reader.read();
		if (chunk.done) {
			break;
		}

		total += chunk.value.byteLength;
		if (total > maximumBytes) {
			await reader.cancel();
			throw new StreamUpstreamError(`Upstream body is larger than ${maximumBytes} bytes`, null);
		}
		chunks.push(chunk.value);
	}

	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
};

const readCandidate = async (
	url: string,
	kind: StreamTargetKind,
	headers: Headers,
	timeoutMs: number,
	signal: AbortSignal,
	answered: () => void,
): Promise<UpstreamBytes> => {
	const upstream = await fetchFollowingRedirects(url, headers, timeoutMs, signal);
	answered();

	const body = await attempt(readBounded(upstream.response, maximumBodyBytes[kind]));
	if (body.error) {
		if (body.error instanceof StreamUpstreamError) {
			throw body.error;
		}
		throw new StreamUpstreamError(`Upstream ${new URL(url).host} stopped sending`, null, {
			cause: body.error,
		});
	}
	const bytes = body.data;

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
};

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
export const fetchUpstreamBytes = async (
	target: StreamTarget,
	signal?: AbortSignal,
): Promise<UpstreamBytes> => {
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
				launch,
			);
		};

		launch();
	});
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
