import { describe, expect, test } from "bun:test";

import { InvalidInputError } from "../../errors";
import { preferences } from "./preferences";

describe("profile preferences", () => {
	const profile = `preferences-test-${crypto.randomUUID()}`;

	test("shows spoilers and sends every kind of notification until the profile chooses", async () => {
		expect(await preferences.profile(profile)).toEqual({
			hide_spoilers: false,
			notifications: {
				dubs: true,
				episodes: true,
				premieres: true,
			},
		});
	});

	test("changes one notification kind and leaves the others as they were", async () => {
		const changed = await preferences.updateProfile(profile, {
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
		await preferences.updateProfile(profile, {
			notifications: {
				episodes: false,
			},
		});

		const changed = await preferences.updateProfile(profile, {
			hide_spoilers: true,
		});

		expect(changed.hide_spoilers).toBe(true);
		expect(changed.notifications.episodes).toBe(false);
		expect(await preferences.profile(profile)).toEqual(changed);
	});

	test("rejects invalid input in both the type contract and runtime schema", async () => {
		await expect(
			preferences.updateProfile(profile, {
				// @ts-expect-error the type contract must reject this non-boolean input
				hide_spoilers: "yes",
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
	});
});
