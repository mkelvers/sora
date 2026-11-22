import type { episodeProgress } from "../../database/schema/library";
import type { Progress } from "../../models/library";

/** A user's stored progress in one episode. */
export class Played {
	readonly #row: typeof episodeProgress.$inferSelect;

	constructor(row: typeof episodeProgress.$inferSelect) {
		this.#row = row;
	}

	/** The progress as clients see it. */
	get progress(): Progress {
		const row = this.#row;

		return {
			duration_seconds: row.durationSeconds,
			episode: row.episode,
			finished: row.finished,
			position_seconds: row.positionSeconds,
			series_id: row.seriesId,
			watched_at: row.watchedAt.toISOString(),
		};
	}
}
