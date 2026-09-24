/**
 * Stable, transport-independent failure codes.
 *
 * Client-facing layers (HTTP, RPC, a TV app's local bridge) map these to their
 * own status representation. The codes are part of the public contract;
 * messages are not.
 */
export type CoreErrorCode =
  | "ANIME_NOT_FOUND"
  | "SERIES_NOT_FOUND"
  | "SEASON_NOT_FOUND"
  | "EPISODE_NOT_FOUND"
  | "PLAYBACK_UNAVAILABLE"
  | "UPSTREAM_UNAVAILABLE"
  | "INVALID_STREAM_TOKEN"
  | "INVALID_INPUT";

/**
 * Base class for every failure the core expects callers to handle.
 *
 * Anything thrown that is not a `CoreError` is an unexpected defect and
 * should be reported as an internal error.
 */
export class CoreError extends Error {
  readonly code: CoreErrorCode;

  constructor(code: CoreErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "CoreError";
    this.code = code;
  }
}

/** The AniList ID does not identify an anime. */
export class AnimeNotFoundError extends CoreError {
  readonly anilistId: number;

  constructor(anilistId: number) {
    super("ANIME_NOT_FOUND", `Anime ${anilistId} does not exist`);
    this.anilistId = anilistId;
  }
}

/** The ID does not identify a stored series. */
export class SeriesNotFoundError extends CoreError {
  readonly seriesId: string;

  constructor(seriesId: string) {
    super("SERIES_NOT_FOUND", `Series ${seriesId} does not exist`);
    this.seriesId = seriesId;
  }
}

/** The ID does not identify a stored season. */
export class SeasonNotFoundError extends CoreError {
  readonly seasonId: string;

  constructor(seasonId: string) {
    super("SEASON_NOT_FOUND", `Season ${seasonId} does not exist`);
    this.seasonId = seasonId;
  }
}

/**
 * The season has no such episode, or nothing can stream it: an extra only
 * TMDB lists, or an episode no provider carries.
 */
export class EpisodeNotFoundError extends CoreError {
  constructor(seasonId: string, episode: number) {
    super("EPISODE_NOT_FOUND", `Season ${seasonId} has no playable episode ${episode}`);
  }
}

/**
 * Every configured provider failed to produce a playable stream.
 *
 * `attempts` records each provider's failure so operators can tell a missing
 * mapping apart from a broken scraper.
 */
export class PlaybackUnavailableError extends CoreError {
  readonly attempts: readonly ProviderAttempt[];

  constructor(seasonId: string, episode: number, attempts: readonly ProviderAttempt[]) {
    super("PLAYBACK_UNAVAILABLE", `No provider could play season ${seasonId} episode ${episode}`);
    this.attempts = attempts;
  }
}

/** One provider's reason for not serving a stream. */
export interface ProviderAttempt {
  provider: string;
  reason: string;
}

/**
 * A required upstream service (AniList) is unreachable, rate limited, or
 * returned an invalid response. Callers should treat this as retryable.
 */
export class UpstreamUnavailableError extends CoreError {
  /** Delay the upstream asked for before retrying, in milliseconds. */
  readonly retryAfterMs: number | null;

  constructor(
    message: string,
    options: {
      retryAfterMs: number | null;
      cause?: unknown;
    }
  ) {
    super("UPSTREAM_UNAVAILABLE", message, {
      cause: options.cause
    });
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** A stream proxy token is malformed, forged, or expired. */
export class InvalidStreamTokenError extends CoreError {
  constructor(reason: string) {
    super("INVALID_STREAM_TOKEN", reason);
  }
}

/** Caller-supplied input failed validation. */
export class InvalidInputError extends CoreError {
  constructor(message: string, options?: ErrorOptions) {
    super("INVALID_INPUT", message, options);
  }
}
