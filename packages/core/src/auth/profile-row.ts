import type { profile } from "../database/schema/auth";
import type { Profile } from "../models/profile";

/** A stored profile, as the database returns it. */
export class ProfileRow {
	readonly #row: typeof profile.$inferSelect;

	constructor(row: typeof profile.$inferSelect) {
		this.#row = row;
	}

	/** The profile as clients see it. */
	get profile(): Profile {
		const row = this.#row;

		return {
			avatar: {
				seed: row.avatarSeed,
				style: row.avatarStyle,
			},
			color: row.color,
			created_at: row.createdAt.toISOString(),
			id: row.id,
			name: row.name,
		};
	}
}
