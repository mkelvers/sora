import { createHmac, timingSafeEqual } from "node:crypto";

import { z } from "zod";

import { InvalidStreamTokenError } from "../../errors";

/**
 * What the proxy should expect behind a token.
 *
 * - `playlist`: an HLS playlist whose URIs are rewritten to new tokens.
 * - `segment`: a media segment or initialization section, streamed through.
 * - `subtitle`: a subtitle file, streamed through.
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
  /** Unix time in seconds after which the token is rejected. */
  expiresAt: number;
}

const StreamTargetSchema = z.object({
  u: z.url({
    protocol: /^https?$/
  }),
  k: z.enum(["playlist", "segment", "subtitle", "key", "file"]),
  h: z.record(z.string(), z.string()),
  m: z.array(
    z.url({
      protocol: /^https?$/
    })
  ),
  e: z.number().int().positive()
});

/**
 * Encodes a target as an opaque, URL-safe token signed with `secret`.
 *
 * Tokens are signed, not encrypted: the upstream URL is readable by anyone
 * holding the token, but cannot be changed without invalidating it. That is
 * what prevents the proxy from being used to fetch arbitrary URLs.
 */
export function signStreamTarget(target: StreamTarget, secret: string) {
  const payload = Buffer.from(
    JSON.stringify({
      u: target.url,
      k: target.kind,
      h: target.headers,
      m: target.mirrors,
      e: target.expiresAt
    })
  ).toString("base64url");

  return `${payload}.${signature(payload, secret)}`;
}

/**
 * Decodes and authenticates a token produced by {@link signStreamTarget}.
 *
 * @throws {@link InvalidStreamTokenError} when the token is malformed, its
 *   signature does not match, or it has expired.
 */
export function verifyStreamToken(token: string, secret: string, now = new Date()): StreamTarget {
  const [payload, supplied, ...rest] = token.split(".");
  if (!payload || !supplied || rest.length > 0) {
    throw new InvalidStreamTokenError("Malformed stream token");
  }

  const expected = Buffer.from(signature(payload, secret));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new InvalidStreamTokenError("Stream token signature is invalid");
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new InvalidStreamTokenError("Stream token payload is not JSON");
  }

  const parsed = StreamTargetSchema.safeParse(decoded);
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
    expiresAt: parsed.data.e
  };
}

function signature(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
