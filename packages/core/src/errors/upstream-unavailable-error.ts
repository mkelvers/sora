import { CoreError } from "./core-error";

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
		},
	) {
		super("UPSTREAM_UNAVAILABLE", message, {
			cause: options.cause,
		});
		this.name = "UpstreamUnavailableError";
		this.retryAfterMs = options.retryAfterMs;
	}
}
