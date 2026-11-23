import { config } from "../../config";
import { getRefinement } from "../subtitles/store";
import { rewrite, withDefaultAudio } from "./playlist";
import { readahead } from "./readahead";
import { isDisguised, unwrapDisguised } from "./segment";
import { cleanWebVtt, retimeWebVtt } from "./subtitle";
import { StreamToken } from "./token";
import type { StreamTarget } from "./token";
import { fetchTarget, mirrorsFor, readTarget } from "./upstream";
import { StreamUpstreamError } from "./upstream-error";

/** One stream resource a token lets the proxy serve. */
export class Resource {
	readonly #target: StreamTarget;

	constructor(target: StreamTarget) {
		this.#target = target;
	}

	/** A whole segment, served from the read-ahead. */
	async whole() {
		const segment = await readahead.read(this.#target);

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

	/**
	 * The playlist with its URIs rewritten to new tokens. Its segments' order is
	 * remembered for the read-ahead.
	 */
	async playlist(signal: AbortSignal | undefined) {
		/** Playlists are buffered for rewriting; anything larger is not a playlist. */
		const maximumBytes = 4 * 1024 * 1024;

		const target = this.#target;
		const upstream = await readTarget(target, signal);

		if (upstream.bytes.byteLength > maximumBytes) {
			throw new StreamUpstreamError("Upstream playlist is too large", null);
		}

		const decoded = new TextDecoder().decode(upstream.bytes);

		if (!decoded.trimStart().startsWith("#EXTM3U")) {
			throw new StreamUpstreamError("Upstream did not return an HLS playlist", null);
		}

		let content = decoded;

		if (target.audio) {
			content = withDefaultAudio(decoded, target.audio);
		}

		// Children inherit the parent's headers and expiry, so a playlist cannot be
		// used to mint tokens that outlive the one the client was given.
		const segments: StreamTarget[] = [];

		const rewritten = rewrite(content, upstream.url, (url, kind) => {
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

			return new StreamToken(config.streamSigningSecret).sign(child);
		});

		readahead.remember(segments);

		return new Response(rewritten, {
			headers: {
				// Live playlists change; media playlists for VOD are cheap to refetch.
				"Cache-Control": "no-cache",
				"Content-Type": "application/vnd.apple.mpegurl",
			},
			status: 200,
		});
	}

	/**
	 * A subtitle or key, read whole. WebVTT subtitles are cleaned of ASS escapes
	 * and retimed when the token asks for it.
	 */
	async small(signal: AbortSignal | undefined) {
		/** The signature a WebVTT file starts with, after an optional byte order mark. */
		const webVttHeader = /^﻿?WEBVTT/u;

		const target = this.#target;
		const upstream = await readTarget(target, signal);
		let text = "";

		if (target.kind === "subtitle") {
			text = new TextDecoder().decode(upstream.bytes);
		}

		if (target.shifts || webVttHeader.test(text)) {
			let stored: Awaited<ReturnType<typeof getRefinement>> = null;

			if (target.refinement) {
				stored = await getRefinement(target.refinement);
			}

			const cleaned = cleanWebVtt(text);
			let body = cleaned;

			if (target.shifts) {
				body = retimeWebVtt(cleaned, target.shifts, stored?.refinement?.anchors ?? []);
			}

			return new Response(body, {
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

	/**
	 * The resource streamed through, from `range` when one is asked for. A whole
	 * segment that starts with a disguising image header is buffered and the
	 * image removed.
	 */
	async stream(range: string | null, signal: AbortSignal | undefined) {
		const target = this.#target;
		const upstream = await fetchTarget(target, range, signal);

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

		const disguised =
			target.kind === "segment" && contentType && /^(?:image|text)\//iu.test(contentType);

		if (disguised) {
			headers.set("Content-Type", "video/mp2t");
		}

		// A ranged response cannot be unwrapped without breaking its byte offsets.
		const whole = target.kind === "segment" && upstream.response.status === 200;
		const { body } = upstream.response;

		if (!whole || !body) {
			return new Response(body, {
				headers,
				status: upstream.response.status,
			});
		}

		const reader = body.getReader();
		const first = await reader.read();

		if (first.done) {
			return new Response(null, {
				headers,
				status: 200,
			});
		}

		if (isDisguised(first.value)) {
			const chunks = [first.value];
			reader.releaseLock();

			for await (const chunk of body) {
				chunks.push(chunk);
			}

			const segment = unwrapDisguised(Buffer.concat(chunks));
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
	}
}
