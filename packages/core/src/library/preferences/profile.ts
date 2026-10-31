import { defined } from "@sora/shared";
import { eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { profilePreference } from "../../database/schema/library";
import { InvalidInputError } from "../../errors";
import { ProfilePreferencesUpdateSchema } from "../../models/library";
import type { ProfilePreferences, ProfilePreferencesUpdate } from "../../models/library";

const defaults: ProfilePreferences = {
	hide_spoilers: false,
	notifications: {
		dubs: true,
		episodes: true,
		premieres: true,
	},
};

const toPreferences = (row: typeof profilePreference.$inferSelect): ProfilePreferences => ({
	hide_spoilers: row.hideSpoilers,
	notifications: {
		dubs: row.notifyDubs,
		episodes: row.notifyEpisodes,
		premieres: row.notifyPremieres,
	},
});

/** A profile's display and notification preferences; the defaults until they pick anything. */
export const getProfilePreferences = async (userId: string): Promise<ProfilePreferences> => {
	const [row] = await db
		.select()
		.from(profilePreference)
		.where(eq(profilePreference.userId, userId))
		.limit(1);

	return row ? toPreferences(row) : defaults;
};

/**
 * Changes a profile's display and notification preferences and returns them
 * as they now stand.
 *
 * @throws {InvalidInputError} when the update fails
 *   {@link ProfilePreferencesUpdateSchema}.
 */
export const updateProfilePreferences = async (
	userId: string,
	update: ProfilePreferencesUpdate,
): Promise<ProfilePreferences> => {
	const parsed = ProfilePreferencesUpdateSchema.safeParse(update);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid profile preferences", {
			cause: parsed.error,
		});
	}

	const { hide_spoilers: hideSpoilers, notifications } = parsed.data;
	const changes = {
		...(hideSpoilers !== undefined && {
			hideSpoilers,
		}),
		...(notifications?.dubs !== undefined && {
			notifyDubs: notifications.dubs,
		}),
		...(notifications?.episodes !== undefined && {
			notifyEpisodes: notifications.episodes,
		}),
		...(notifications?.premieres !== undefined && {
			notifyPremieres: notifications.premieres,
		}),
	};
	const [row] = await db
		.insert(profilePreference)
		.values({
			...changes,
			userId,
		})
		.onConflictDoUpdate({
			set: {
				...changes,
				updatedAt: sql`now()`,
			},
			target: profilePreference.userId,
		})
		.returning();

	return toPreferences(defined(row));
};
