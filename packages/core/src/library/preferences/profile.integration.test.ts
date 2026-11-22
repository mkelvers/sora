import { describe, expect, test } from "bun:test";

import { InvalidInputError } from "../../errors";
import { getProfilePreferences, updateProfilePreferences } from "./profile";

describe("profile preferences", () => {
	const profile = `preferences-test-${crypto.randomUUID()}`;

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
		await updateProfilePreferences(profile, {
			notifications: {
				episodes: false,
			},
		});

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
});
