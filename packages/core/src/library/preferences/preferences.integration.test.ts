import { afterAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";

import { databaseTestsEnabled } from "../../../test/integration";
import { db } from "../../database/client";
import { playbackPreference } from "../../database/schema/library";
import { InvalidInputError } from "../../errors";
import { getPlaybackPreferences, updatePlaybackPreferences } from "./preferences";

// Run against a disposable database. The fixture uses
// its own profile ID and is removed even when an assertion fails.
describe.skipIf(!databaseTestsEnabled())("playback preferences", () => {
	const profile = `preferences-test-${crypto.randomUUID()}`;

	afterAll(async () => {
		await db.delete(playbackPreference).where(eq(playbackPreference.userId, profile));
	});

	test("shows medium white outlined subtitles with no box until the profile chooses", async () => {
		const preferences = await getPlaybackPreferences(profile);

		expect(preferences.subtitle_style).toEqual({
			background_color: "black",
			background_opacity: 0,
			edge: "outline",
			edge_width: "medium",
			size: "medium",
			text_color: "white",
		});
		expect(preferences.subtitle_style_changed).toBe(false);
	});

	test("changes one part of the subtitle style and keeps the rest", async () => {
		await updatePlaybackPreferences(profile, {
			subtitle_style: {
				background_opacity: 75,
			},
		});

		const changed = await updatePlaybackPreferences(profile, {
			subtitle_style: {
				size: "large",
			},
		});

		expect(changed.subtitle_style).toEqual({
			background_color: "black",
			background_opacity: 75,
			edge: "outline",
			edge_width: "medium",
			size: "large",
			text_color: "white",
		});
		expect(changed.subtitle_style_changed).toBe(true);
	});

	test("keeps the subtitle style when another preference changes", async () => {
		const changed = await updatePlaybackPreferences(profile, {
			auto_skip: true,
		});

		expect(changed.subtitle_style.size).toBe("large");
		expect(await getPlaybackPreferences(profile)).toEqual(changed);
	});

	test("puts the subtitle style back to its defaults", async () => {
		const reset = await updatePlaybackPreferences(profile, {
			subtitle_style: null,
		});

		expect(reset.subtitle_style).toEqual({
			background_color: "black",
			background_opacity: 0,
			edge: "outline",
			edge_width: "medium",
			size: "medium",
			text_color: "white",
		});
		expect(reset.subtitle_style_changed).toBe(false);
		expect(reset.auto_skip).toBe(true);
	});

	test("reads a stored part Sora no longer offers as its default", async () => {
		await db
			.update(playbackPreference)
			.set({
				subtitleStyle: {
					edge: "shadow",
					position: "top",
					size: 100,
				},
			})
			.where(eq(playbackPreference.userId, profile));
		const { subtitle_style: style } = await getPlaybackPreferences(profile);

		expect(style).toEqual({
			background_color: "black",
			background_opacity: 0,
			edge: "shadow",
			edge_width: "medium",
			size: "medium",
			text_color: "white",
		});
	});

	test("rejects a subtitle style that is not valid", async () => {
		await expect(
			updatePlaybackPreferences(profile, {
				subtitle_style: {
					// @ts-expect-error -- a size Sora does not offer
					size: "huge",
				},
			}),
		).rejects.toBeInstanceOf(InvalidInputError);
	});
});
