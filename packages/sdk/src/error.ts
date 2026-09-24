import type { Problem } from "@sora/api";

/**
 * A request the API answered with an error.
 *
 * Branch on {@link SoraError.code}, which is stable, such as
 * `SERIES_NOT_FOUND` or `PLAYBACK_UNAVAILABLE`; the message may change. The
 * API may add codes, so handle ones you do not know.
 */
export class SoraError extends Error {
  /** The HTTP status. */
  readonly status: number;
  /** The API's failure code, or `HTTP_ERROR` when the response carried no problem body. */
  readonly code: string;
  /** Every invalid field, for `INVALID_INPUT`. */
  readonly errors: NonNullable<Problem["errors"]>;
  /** How long the API asked to wait before retrying, in seconds, when it said. */
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    details: {
      status: number;
      code: string;
      errors?: Problem["errors"];
      retryAfterSeconds: number | null;
    }
  ) {
    super(message);
    this.name = "SoraError";
    this.status = details.status;
    this.code = details.code;
    this.errors = details.errors ?? [];
    this.retryAfterSeconds = details.retryAfterSeconds;
  }

  /** Builds the error for a failed response, reading its problem body when it has one. */
  static async from(response: {
    status: number;
    statusText: string;
    headers: Headers;
    json(): Promise<unknown>;
  }): Promise<SoraError> {
    // The API answers every failure with a problem; anything else came from
    // in front of it, such as a proxy.
    const problem = response.headers.get("Content-Type")?.startsWith("application/problem+json")
      ? ((await response.json()) as Problem)
      : null;
    const retryAfter = Number(response.headers.get("Retry-After"));

    return new SoraError(problem?.detail ?? `The API answered ${response.status} ${response.statusText}`, {
      status: response.status,
      code: problem?.code ?? "HTTP_ERROR",
      errors: problem?.errors,
      retryAfterSeconds: retryAfter > 0 ? retryAfter : null
    });
  }
}
