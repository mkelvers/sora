import { sql } from "drizzle-orm";

import type { TrackAiringPayload } from "./queue";

/** An airing check of one anime, as graphile-worker stores it. */
export class AiringJob {
	readonly #payload: TrackAiringPayload;

	constructor(payload: TrackAiringPayload) {
		this.#payload = payload;
	}

	/**
	 * Each anime has at most one pending airing check, identified by this key.
	 * It is also written in SQL by `reviveAiringChecks`.
	 */
	get key(): string {
		return `airing:${this.#payload.anilistId}`;
	}

	/**
	 * The payload built in SQL, since the driver would send a serialized
	 * payload as a JSON string rather than an object.
	 */
	get json() {
		const payload = this.#payload;

		return sql`json_build_object(
    'anilistId', ${payload.anilistId}::int,
    'awaitedEpisode', ${payload.awaitedEpisode}::float8,
    'attempt', ${payload.attempt}::int
  )`;
	}
}
