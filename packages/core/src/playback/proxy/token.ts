import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { attempt } from "@sora/shared";
import { z } from "zod";

import { StreamTokenError } from "../../errors";
import type { TimelineShift } from "../streams/align";
import { Secret } from "./secret";

/**
 * What the proxy should expect behind a token.
 *
 * - `playlist`: an HLS playlist whose URIs are rewritten to new tokens.
 * - `segment`: a media segment or initialization section, streamed through.
 * - `subtitle`: a subtitle file, streamed through, or retimed by `shifts`.
 * - `key`: an HLS decryption key, streamed through.
 * - `file`: a progressive (non-HLS) video file, streamed with range support.
 */
export type StreamTargetKind = "playlist" | "segment" | "subtitle" | "key" | "file";

/** An upstream resource the proxy is authorized to fetch. */
export interface StreamTarget {
	url: string;
	kind: StreamTargetKind;
	/** Request headers the upstream requires, typically `Referer`. */
	headers: Record<string, string>;
	/** Alternative URLs for the same resource, tried in order if `url` fails. */
	mirrors: string[];
	/** The account the token was issued to; nobody else may use it. */
	accountId: string;
	/** Unix time in seconds after which the token is rejected. */
	expiresAt: number;
	/** For a subtitle made for another encode, how to move its cues onto this one. */
	shifts?: TimelineShift[];
	/** The stored refinement whose anchors move this subtitle's cues to when the dub says them. */
	refinement?: string;
	/** For a master playlist, the BCP 47 language of the audio players should start with, such as a dub's `en`. */
	audio?: string;
}

/** Seals stream targets into the opaque tokens clients see, and opens them again, with one secret. */
export class StreamToken {
	static readonly #schema = z.object({
		a: z.string().min(1),
		e: z.number().int().positive(),
		h: z.record(z.string(), z.string()),
		k: z.enum(["playlist", "segment", "subtitle", "key", "file"]),
		l: z.string().min(1).optional(),
		m: z.array(
			z.url({
				protocol: /^https?$/u,
			}),
		),
		r: z.string().min(1).optional(),
		t: z.array(z.tuple([z.number(), z.number()])).optional(),
		u: z.url({
			protocol: /^https?$/u,
		}),
	});

	static readonly #tagLength = 16;

	readonly #secret: Secret;

	constructor(secret: string) {
		this.#secret = new Secret(secret);
	}

	/**
	 * Encodes a target as an opaque, URL-safe token, encrypted and authenticated
	 * with a key made from the secret.
	 *
	 * The token is what clients see in place of the upstream URL, so it hides
	 * it, along with the headers and mirrors, and cannot be changed without
	 * being rejected. That is also what prevents the proxy from being used to
	 * fetch arbitrary URLs.
	 */
	sign(target: StreamTarget): string {
		const initializationVector = randomBytes(12);
		const cipher = createCipheriv("aes-256-gcm", this.#secret.key, initializationVector);

		const sealed = Buffer.concat([
			cipher.update(
				JSON.stringify({
					a: target.accountId,
					e: target.expiresAt,
					h: target.headers,
					k: target.kind,
					l: target.audio,
					m: target.mirrors,
					r: target.refinement,
					t: target.shifts?.map(({ from, offset }) => [from, offset]),
					u: target.url,
				}),
				"utf-8",
			),
			cipher.final(),
			cipher.getAuthTag(),
		]);

		return `${initializationVector.toString("base64url")}.${sealed.toString("base64url")}`;
	}

	/**
	 * Decrypts and authenticates a token produced by {@link StreamToken.sign}.
	 *
	 * @throws {StreamTokenError} when the token is malformed, was
	 *   not made with this secret, or has expired.
	 */
	verify(token: string, now = new Date()): StreamTarget {
		const [encodedVector, encodedSealed, ...rest] = token.split(".");

		const malformed = !encodedVector || !encodedSealed || rest.length > 0;

		if (malformed) {
			throw new StreamTokenError("Malformed stream token");
		}

		const initializationVector = Buffer.from(encodedVector, "base64url");
		const sealed = Buffer.from(encodedSealed, "base64url");

		if (initializationVector.length !== 12 || sealed.length <= StreamToken.#tagLength) {
			throw new StreamTokenError("Malformed stream token");
		}

		const { data: json, error: unsealError } = attempt(() => {
			const decipher = createDecipheriv("aes-256-gcm", this.#secret.key, initializationVector);
			decipher.setAuthTag(sealed.subarray(sealed.length - StreamToken.#tagLength));

			return Buffer.concat([
				decipher.update(sealed.subarray(0, sealed.length - StreamToken.#tagLength)),
				decipher.final(),
			]).toString("utf-8");
		}, Error);

		if (unsealError) {
			throw new StreamTokenError("Stream token is not valid");
		}

		const { data, error } = attempt(() => JSON.parse(json), SyntaxError);

		if (error) {
			throw new StreamTokenError("Stream token payload is not JSON");
		}

		const parsed = StreamToken.#schema.safeParse(data);

		if (!parsed.success) {
			throw new StreamTokenError("Stream token payload is invalid");
		}

		if (parsed.data.e * 1000 <= now.getTime()) {
			throw new StreamTokenError("Stream token has expired");
		}

		return {
			accountId: parsed.data.a,
			audio: parsed.data.l,
			expiresAt: parsed.data.e,
			headers: parsed.data.h,
			kind: parsed.data.k,
			mirrors: parsed.data.m,
			refinement: parsed.data.r,
			shifts: parsed.data.t?.map(([from, offset]) => ({
				from,
				offset,
			})),
			url: parsed.data.u,
		};
	}
}
