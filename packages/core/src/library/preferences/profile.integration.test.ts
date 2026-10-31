import { afterAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { db } from "../../database/client";
import { profilePreference } from "../../database/schema/library";
import { InvalidInputError } from "../../errors";
import { getProfilePreferences, updateProfilePreferences } from "./profile";

// Opt in against a local database with migrations applied. The fixture uses
// its own profile ID and is removed even when an assertion fails.
describe.skipIf(process.env.SORA_PROFILE_PREFERENCES_INTEGRATION !== "1")(
	"profile preferences",
	() => {
		const profile = `preferences-test-${crypto.randomUUID()}`;

		afterAll(async () => {
			await db.delete(profilePreference).where(eq(profilePreference.userId, profile));
		});

		test("shows spoilers and sends every kind of notification until the profile chooses", async () => {
			expect(await getProfilePreferences(profile)).toEqual({
				hide_spoilers: false,
				notifications: {
					dubs: true,
					episodes: true,
					premieres: true,
				},
			});
		});

		test("changes one notification kind and leaves the others as they were", async () => {
			const changed = await updateProfilePreferences(profile, {
				notifications: {
					episodes: false,
				},
			});

			expect(changed.notifications).toEqual({
				dubs: true,
				episodes: false,
				premieres: true,
			});
			expect(changed.hide_spoilers).toBe(false);
		});

		test("keeps notification choices when another preference changes", async () => {
			const changed = await updateProfilePreferences(profile, {
				hide_spoilers: true,
			});

			expect(changed.hide_spoilers).toBe(true);
			expect(changed.notifications.episodes).toBe(false);
			expect(await getProfilePreferences(profile)).toEqual(changed);
		});

		test("rejects an update that is not valid", async () => {
			await expect(
				updateProfilePreferences(profile, {
					hide_spoilers: "yes",
				} as never),
			).rejects.toBeInstanceOf(InvalidInputError);
		});
	},
);
