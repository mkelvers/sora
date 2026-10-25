import { CoreError } from "./core-error";

/** One provider's reason for not serving a stream. */
export interface ProviderAttempt {
	provider: string;
	reason: string;
}

/**
 * Every configured provider failed to produce a playable stream.
 *
 * `attempts` records each provider's failure so operators can tell a missing
 * mapping apart from a broken scraper.
 */
export class PlaybackUnavailableError extends CoreError {
	readonly attempts: readonly ProviderAttempt[];

	constructor(seriesId: string, episode: number, attempts: readonly ProviderAttempt[]) {
		super("PLAYBACK_UNAVAILABLE", `No provider could play series ${seriesId} episode ${episode}`);
		this.name = "PlaybackUnavailableError";
		this.attempts = attempts;
	}
}
