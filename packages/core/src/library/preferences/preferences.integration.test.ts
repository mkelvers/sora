import { afterAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { db } from "../../database/client";
import { playbackPreference } from "../../database/schema/library";
import { InvalidInputError } from "../../errors";
import { getPlaybackPreferences, updatePlaybackPreferences } from "./preferences";

// Opt in against a local database with migrations applied. The fixture uses
// its own profile ID and is removed even when an assertion fails.
describe.skipIf(process.env.SORA_PLAYBACK_PREFERENCES_INTEGRATION !== "1")(
	"playback preferences",
	() => {
		const profile = `preferences-test-${crypto.randomUUID()}`;

		afterAll(async () => {
			await db.delete(playbackPreference).where(eq(playbackPreference.userId, profile));
		});

		test("shows white outlined subtitles at the bottom until the profile chooses", async () => {
			const { subtitle_style: style } = await getPlaybackPreferences(profile);

			expect(style).toEqual({
				background_color: "black",
				background_opacity: 0,
				edge: "outline",
				position: "bottom",
				size: 100,
				text_color: "white",
				text_opacity: 100,
			});
		});

		test("changes one part of the subtitle style and keeps the rest", async () => {
			await updatePlaybackPreferences(profile, {
				subtitle_style: {
					background_opacity: 75,
				},
			});
			const changed = await updatePlaybackPreferences(profile, {
				subtitle_style: {
					position: "top",
				},
			});

			expect(changed.subtitle_style).toMatchObject({
				background_opacity: 75,
				edge: "outline",
				position: "top",
			});
		});

		test("keeps the subtitle style when another preference changes", async () => {
			const changed = await updatePlaybackPreferences(profile, {
				auto_skip: true,
			});

			expect(changed.subtitle_style.position).toBe("top");
			expect(await getPlaybackPreferences(profile)).toEqual(changed);
		});

		test("rejects a subtitle style that is not valid", async () => {
			await expect(
				updatePlaybackPreferences(profile, {
					subtitle_style: {
						// @ts-expect-error -- an opacity Sora does not offer
						text_opacity: 0,
					},
				}),
			).rejects.toBeInstanceOf(InvalidInputError);
		});
	},
);
