import http from "node:http";
import https from "node:https";
import { Readable } from "node:stream";
import { setTimeout as sleep } from "node:timers/promises";

import { attempt, parseRetryAfter, second } from "@sora/shared";

import { InvalidStreamTokenError } from "../../errors";
import { Host } from "./host";
import { isBareImage } from "./segment";
import type { StreamTargetKind } from "./token";
import { StreamUpstreamError } from "./upstream-error";

/** A successful upstream response. */
export interface Upstream {
	response: Response;
	/** Final URL after redirects, used to resolve relative playlist URIs. */
	url: string;
}

/** A whole upstream body, read before any candidate host is trusted. */
export interface UpstreamBytes {
	bytes: Uint8Array<ArrayBuffer>;
	headers: Headers;
	/** Final URL after redirects, used to resolve relative playlist URIs. */
	url: string;
}

/**
 * Reads a response's whole body, giving up as soon as it passes `maximumBytes`.
 * `received` is called each time bytes arrive.
 *
 * @throws {StreamUpstreamError} when the body is larger than `maximumBytes`.
 */
export const readBounded = async (
	response: Response,
	maximumBytes: number,
	received?: () => void,
) => {
	if (Number(response.headers.get("Content-Length")) > maximumBytes) {
		await response.body?.cancel();
		throw new StreamUpstreamError(`Upstream body is larger than ${maximumBytes} bytes`, null);
	}

	const chunks: Uint8Array[] = [];
	let total = 0;

	// Leaving the loop early, as by the throw below, cancels the stream.
	for await (const chunk of response.body ?? []) {
		total += chunk.byteLength;

		if (total > maximumBytes) {
			throw new StreamUpstreamError(`Upstream body is larger than ${maximumBytes} bytes`, null);
		}

		chunks.push(chunk);
		received?.();
	}

	const bytes = new Uint8Array(total);
	let offset = 0;

	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}

	return bytes;
};

/**
 * Requests to upstream hosts with the same headers, time limit, and signal,
 * following redirects and connecting only to public hosts.
 */
export class Hops {
	readonly #headers: Headers;
	readonly #timeoutMs: number;
	readonly #signal: AbortSignal | undefined;

	constructor(headers: Headers, timeoutMs: number, signal?: AbortSignal) {
		this.#headers = headers;
		this.#timeoutMs = timeoutMs;
		this.#signal = signal;
	}

	/**
	 * Fetches `url`, following its redirects. Each hop is checked first: URLs
	 * the proxy must never fetch are non-HTTP schemes, loopback, and private or
	 * link-local IP literals. Hostnames are vetted when the connection is made;
	 * see {@link Host.lookup}.
	 *
	 * Tokens are signed, but playlist URIs come from third-party servers, so a
	 * hostile playlist could otherwise point the proxy at internal services.
	 *
	 * @throws {InvalidStreamTokenError} for a URL that is not public.
	 * @throws {StreamUpstreamError} when the host fails or answers with an error.
	 */
	async follow(url: string, redirects = 0): Promise<Upstream> {
		const maximumRedirects = 5;

		if (redirects > maximumRedirects) {
			throw new StreamUpstreamError("Upstream stream redirected too many times", null);
		}

		const parsed = new URL(url);

		if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
			throw new InvalidStreamTokenError("Stream target must use HTTP");
		}

		const host = new Host(parsed.hostname.replaceAll(/^\[|\]$/gu, "").toLowerCase());

		if (host.internal) {
			throw new InvalidStreamTokenError("Stream target is not a public host");
		}

		const endsAt = Date.now() + this.#timeoutMs;
		const timeout = AbortSignal.timeout(this.#timeoutMs);
		let deadline = timeout;

		if (this.#signal) {
			deadline = AbortSignal.any([this.#signal, timeout]);
		}

		const data = await this.#request(url, endsAt, deadline);

		const location = data.headers.get("Location");

		const redirected = data.status >= 300 && data.status < 400 && location;

		if (redirected) {
			// Each hop is re-checked, so a redirect cannot reach a private address.
			return await this.follow(new URL(location, url).toString(), redirects + 1);
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

	/**
	 * Fetches `url` and reads its whole body, calling `answered` when the host
	 * answers and each time bytes arrive.
	 *
	 * @throws {StreamUpstreamError} when the host fails, stops sending, sends
	 *   nothing, or sends an image in place of a segment.
	 */
	async read(url: string, kind: StreamTargetKind, answered: () => void): Promise<UpstreamBytes> {
		/**
		 * The most a body read in full may hold, by what it is. A host that sends
		 * more is not serving that, and reading on would fill memory until the
		 * timeout. A file is streamed, never read in full, so it has no limit.
		 */
		const maximumBodyBytes: Record<StreamTargetKind, number> = {
			file: Number.POSITIVE_INFINITY,
			key: 64 * 1024,
			playlist: 4 * 1024 * 1024,
			segment: 32 * 1024 * 1024,
			subtitle: 4 * 1024 * 1024,
		};

		const upstream = await this.follow(url);
		answered();

		const body = await attempt(readBounded(upstream.response, maximumBodyBytes[kind], answered));

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
	}

	/**
	 * Makes one request, and when the host answers 429, asks again once its
	 * `Retry-After` has passed. A host that throttles a burst is up, and taking it
	 * for down sent playback to a provider without skip segments, or to none.
	 *
	 * The 429 is returned as it is when the wait would be longer than
	 * `maximumWaitMs`, or would outlast `endsAt` or `deadline`.
	 */
	async #request(url: string, endsAt: number, deadline: AbortSignal): Promise<Response> {
		/** The shortest wait before asking a host that answered 429 again, so `Retry-After: 0` is not a busy loop. */
		const minimumWaitMs = 0.5 * second;

		/**
		 * The longest a host's `Retry-After` is waited out before its 429 counts as a
		 * failure. Stream hosts behind Cloudflare answer bursts with 429 and
		 * `Retry-After: 2`, and serve again within seconds.
		 */
		const maximumWaitMs = 5 * second;

		const { data, error } = await attempt(this.#connect(url, deadline));

		if (error) {
			throw new StreamUpstreamError(`Upstream ${new URL(url).host} could not be reached`, null, {
				cause: error,
			});
		}

		if (data.status !== 429) {
			return data;
		}

		const wait = Math.max(parseRetryAfter(data.headers.get("Retry-After")) ?? 0, minimumWaitMs);

		if (wait > maximumWaitMs || Date.now() + wait >= endsAt) {
			return data;
		}

		await data.body?.cancel();

		const waited = await attempt(
			sleep(wait, undefined, {
				signal: deadline,
			}),
		);

		if (waited.error) {
			return data;
		}

		return await this.#request(url, endsAt, deadline);
	}

	/**
	 * Makes one request without following redirects, like `fetch(url, { redirect:
	 * "manual" })`, but connecting only to public addresses.
	 */
	#connect(url: string, signal: AbortSignal): Promise<Response> {
		const { promise, resolve, reject } = Promise.withResolvers<Response>();
		const target = new URL(url);
		const outgoing = Object.fromEntries(this.#headers);
		let send = http.request;

		if (target.protocol === "https:") {
			send = https.request;
		}

		const request = send(
			target,
			{
				headers: {
					Accept: "*/*",
					"Accept-Encoding": "identity",
					"User-Agent": `Bun/${Bun.version}`,
					...outgoing,
				},
				lookup: (name, options, respond) => {
					attempt(new Host(name).lookup(options, respond));
				},
				signal,
			},
			(incoming) => {
				const received = new Headers();

				for (const [name, value] of Object.entries(incoming.headers)) {
					const values = [value].flat();

					for (const each of values) {
						if (each !== undefined) {
							received.append(name, each);
						}
					}
				}

				const status = incoming.statusCode ?? 502;
				const empty = status === 204 || status === 205 || status === 304;
				let body: ReadableStream | null = null;

				if (!empty) {
					body = Readable.toWeb(incoming);
				}

				resolve(
					new Response(body, {
						headers: received,
						status,
						statusText: incoming.statusMessage,
					}),
				);
			},
		);

		request.on("error", reject);
		request.end();

		return promise;
	}
}
