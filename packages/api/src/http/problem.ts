import type { z } from "@hono/zod-openapi";
import { CoreError, PlaybackUnavailableError, UpstreamUnavailableError, type CoreErrorCode } from "@sora/core/errors";
import { StreamUpstreamError } from "@sora/core/playback";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { STATUS_CODES } from "node:http";

import type { ProblemSchema } from "../schemas/common";

type Problem = z.infer<typeof ProblemSchema>;

/**
 * A failure decided by the HTTP layer rather than the core, such as a
 * watchlist entry that does not exist. Throw it from a route; the error
 * handler answers it as a problem.
 */
export class ProblemError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  /** Headers the problem response carries, such as `Retry-After`. */
  readonly headers: Readonly<Record<string, string>>;

  constructor(status: ContentfulStatusCode, code: string, detail: string, headers: Record<string, string> = {}) {
    super(detail);
    this.name = "ProblemError";
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

/** The HTTP status for each core failure. Every code must be listed. */
const statusByCode: Record<CoreErrorCode, ContentfulStatusCode> = {
  ANIME_NOT_FOUND: 404,
  SERIES_NOT_FOUND: 404,
  SEASON_NOT_FOUND: 404,
  EPISODE_NOT_FOUND: 404,
  INVALID_INPUT: 422,
  INVALID_STREAM_TOKEN: 403,
  PLAYBACK_UNAVAILABLE: 502,
  UPSTREAM_UNAVAILABLE: 503
};

/**
 * Sends an RFC 9457 problem details response.
 *
 * `type` is `about:blank`, so `title` is the status's reason phrase; `code`
 * is the stable identifier clients should branch on.
 */
export function sendProblem(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  detail: string,
  extra: Pick<Problem, "errors"> = {}
) {
  const body: Problem = {
    type: "about:blank",
    title: STATUS_CODES[status] ?? "Error",
    status,
    detail,
    instance: c.req.path,
    code,
    ...extra
  };

  return c.newResponse(JSON.stringify(body), status, {
    "Content-Type": "application/problem+json",
    "Cache-Control": "no-store"
  });
}

/**
 * Turns any thrown error into a problem response.
 *
 * Core errors map through {@link statusByCode}. Anything else is a defect:
 * it is logged and answered with a generic 500 that reveals nothing.
 */
export function problemFromError(error: unknown, c: Context) {
  if (error instanceof ProblemError) {
    const response = sendProblem(c, error.status, error.code, error.message);
    for (const [name, value] of Object.entries(error.headers)) {
      response.headers.set(name, value);
    }

    return response;
  }

  if (error instanceof CoreError) {
    if (error instanceof PlaybackUnavailableError) {
      console.warn(`${c.req.method} ${c.req.path}: ${error.message}`, error.attempts);
    }

    const status = error instanceof StreamUpstreamError ? 502 : statusByCode[error.code];
    const response = sendProblem(c, status, error.code, error.message);
    if (error instanceof UpstreamUnavailableError && error.retryAfterMs !== null) {
      response.headers.set("Retry-After", String(Math.ceil(error.retryAfterMs / 1_000)));
    }

    return response;
  }

  if (error instanceof HTTPException) {
    return sendProblem(c, error.status as ContentfulStatusCode, httpCode(error.status), error.message || (STATUS_CODES[error.status] ?? "Error"));
  }

  console.error(`${c.req.method} ${c.req.path} failed`, error);
  return sendProblem(c, 500, "INTERNAL_ERROR", "Something went wrong on our side");
}

/** A code for failures raised by the HTTP layer itself rather than the core. */
function httpCode(status: number) {
  switch (status) {
    case 401:
      return "UNAUTHORIZED";
    case 404:
      return "NOT_FOUND";
    case 405:
      return "METHOD_NOT_ALLOWED";
    default:
      return status >= 500 ? "INTERNAL_ERROR" : "BAD_REQUEST";
  }
}
