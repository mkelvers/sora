import type { profilePreference } from "../../database/schema/library";
import type { ProfilePreferences } from "../../models/library";

/** A profile's stored display and notification preferences. */
export class StoredProfile {
	readonly #row: typeof profilePreference.$inferSelect;

	constructor(row: typeof profilePreference.$inferSelect) {
		this.#row = row;
	}

	get preferences(): ProfilePreferences {
		const row = this.#row;

		return {
			hide_spoilers: row.hideSpoilers,
			notifications: {
				dubs: row.notifyDubs,
				episodes: row.notifyEpisodes,
				premieres: row.notifyPremieres,
			},
		};
	}
}
