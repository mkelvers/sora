import type { Hook } from "@hono/zod-openapi";
import { CoreError, PlaybackUnavailableError, UpstreamUnavailableError, type CoreErrorCode } from "@sora/core/errors";
import { StreamUpstreamError } from "@sora/core/playback";
import type { Context, Env } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import { STATUS_CODES } from "node:http";

import type { Problem } from "./openapi/schemas";

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

/** Sends a {@link Problem}. */
export function sendProblem(
  c: Context,
  status: ContentfulStatusCode,
  code: CoreErrorCode | "NOT_FOUND" | "INTERNAL_ERROR",
  detail: string,
  errors?: Problem["errors"]
) {
  const body: Problem = {
    type: "about:blank",
    title: STATUS_CODES[status] ?? "Error",
    status,
    detail,
    instance: c.req.path,
    code,
    errors
  };

  return c.newResponse(JSON.stringify(body), status, {
    "Content-Type": "application/problem+json",
    "Cache-Control": "no-store"
  });
}

/**
 * The app's error handler. Core errors map through {@link statusByCode};
 * anything else is a defect, logged and answered with a generic 500.
 */
export function onError(error: unknown, c: Context) {
  if (!(error instanceof CoreError)) {
    console.error(`${c.req.method} ${c.req.path} failed`, error);
    return sendProblem(c, 500, "INTERNAL_ERROR", "Something went wrong on our side");
  }

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

/**
 * Answers a request that fails its route's contract with a 422
 * `INVALID_INPUT` problem listing every invalid field.
 */
export const onInvalidRequest: Hook<unknown, Env, string, unknown> = (result, c) => {
  if (!result.success) {
    return sendProblem(
      c,
      422,
      "INVALID_INPUT",
      "The request is invalid",
      result.error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message
      }))
    );
  }
};
