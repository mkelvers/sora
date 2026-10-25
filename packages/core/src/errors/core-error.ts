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
	| "EPISODE_NOT_FOUND"
	| "PROFILE_NOT_FOUND"
	| "LAST_PROFILE"
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
