import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

import { attempt } from "@sora/shared";
import { z } from "zod";

import { InvalidStreamTokenError } from "../../errors";
import type { TimelineShift } from "../streams/align";

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
}

const StreamTargetSchema = z.object({
	u: z.url({
		protocol: /^https?$/,
	}),
	k: z.enum(["playlist", "segment", "subtitle", "key", "file"]),
	h: z.record(z.string(), z.string()),
	m: z.array(
		z.url({
			protocol: /^https?$/,
		}),
	),
	a: z.string().min(1),
	e: z.number().int().positive(),
	t: z.array(z.tuple([z.number(), z.number()])).optional(),
});

/**
 * Encodes a target as an opaque, URL-safe token, encrypted and authenticated
 * with a key made from `secret`.
 *
 * The token is what clients see in place of the upstream URL, so it hides
 * it, along with the headers and mirrors, and cannot be changed without
 * being rejected. That is also what prevents the proxy from being used to
 * fetch arbitrary URLs.
 */
export function signStreamTarget(target: StreamTarget, secret: string) {
	const initializationVector = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", keyFrom(secret), initializationVector);
	const sealed = Buffer.concat([
		cipher.update(
			JSON.stringify({
				u: target.url,
				k: target.kind,
				h: target.headers,
				m: target.mirrors,
				a: target.accountId,
				e: target.expiresAt,
				t: target.shifts?.map(({ from, offset }) => [from, offset]),
			}),
			"utf8",
		),
		cipher.final(),
		cipher.getAuthTag(),
	]);

	return `${initializationVector.toString("base64url")}.${sealed.toString("base64url")}`;
}

/**
 * Decrypts and authenticates a token produced by {@link signStreamTarget}.
 *
 * @throws {@link InvalidStreamTokenError} when the token is malformed, was
 *   not made with `secret`, or has expired.
 */
export function verifyStreamToken(token: string, secret: string, now = new Date()): StreamTarget {
	const [encodedVector, encodedSealed, ...rest] = token.split(".");
	if (!encodedVector || !encodedSealed || rest.length > 0) {
		throw new InvalidStreamTokenError("Malformed stream token");
	}

	const initializationVector = Buffer.from(encodedVector, "base64url");
	const sealed = Buffer.from(encodedSealed, "base64url");
	if (initializationVector.length !== 12 || sealed.length <= tagLength) {
		throw new InvalidStreamTokenError("Malformed stream token");
	}

	const { data: json, error: unsealError } = attempt(() => {
		const decipher = createDecipheriv("aes-256-gcm", keyFrom(secret), initializationVector);
		decipher.setAuthTag(sealed.subarray(sealed.length - tagLength));
		return Buffer.concat([
			decipher.update(sealed.subarray(0, sealed.length - tagLength)),
			decipher.final(),
		]).toString("utf8");
	}, Error);
	if (unsealError) {
		throw new InvalidStreamTokenError("Stream token is not valid");
	}

	const { data, error } = attempt(() => JSON.parse(json), SyntaxError);
	if (error) {
		throw new InvalidStreamTokenError("Stream token payload is not JSON");
	}

	const parsed = StreamTargetSchema.safeParse(data);
	if (!parsed.success) {
		throw new InvalidStreamTokenError("Stream token payload is invalid");
	}

	if (parsed.data.e * 1_000 <= now.getTime()) {
		throw new InvalidStreamTokenError("Stream token has expired");
	}

	return {
		url: parsed.data.u,
		kind: parsed.data.k,
		headers: parsed.data.h,
		mirrors: parsed.data.m,
		accountId: parsed.data.a,
		expiresAt: parsed.data.e,
		shifts: parsed.data.t?.map(([from, offset]) => ({
			from,
			offset,
		})),
	};
}

const tagLength = 16;

function keyFrom(secret: string) {
	return createHash("sha256").update(`sora stream token\0${secret}`).digest();
}
