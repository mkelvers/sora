import { eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { playbackPreference } from "../../database/schema";
import { InvalidInputError } from "../../errors";
import type { SubtitleKind } from "../../playback/streams/subtitle-kind";
import type { ContentLanguage } from "../../series/models";

/** A subtitle track to pick again: the first with this language and kind, else with this language. */
export interface SubtitleChoice {
	/** BCP 47 language tag, for example `en`. */
	language: string;
	kind: SubtitleKind | null;
}

/**
 * How a user likes episodes to play. Players remember what the user picks
 * and play later episodes, on any device, the same way.
 */
export interface PlaybackPreferences {
	/** The version to play when an episode has it; `null` for the first it has. */
	audio: ContentLanguage | null;
	/**
	 * The subtitles picked for a sub and for a dub: a track to pick again, or
	 * `null` for none. An audio left out shows its default track.
	 */
	subtitles: {
		sub?: SubtitleChoice | null;
		dub?: SubtitleChoice | null;
	};
	/** Whether openings and endings are skipped without asking. */
	autoSkip: boolean;
}

const SubtitleChoiceSchema = z.object({
	language: z.string().min(1).max(35),
	kind: z.enum(["dialogue", "signs", "captions"]).nullable(),
});

const SubtitlesSchema = z.object({
	sub: SubtitleChoiceSchema.nullable().optional(),
	dub: SubtitleChoiceSchema.nullable().optional(),
});

/**
 * Changes to a user's playback preferences. Only what is given changes, and
 * the subtitles of one audio change without those of the other.
 */
export const PlaybackPreferencesUpdateSchema = z.object({
	audio: z.enum(["sub", "dub", "raw"]).nullable().optional(),
	subtitles: SubtitlesSchema.optional(),
	autoSkip: z.boolean().optional(),
});

export type PlaybackPreferencesUpdate = z.input<typeof PlaybackPreferencesUpdateSchema>;

const defaults: PlaybackPreferences = {
	audio: null,
	subtitles: {},
	autoSkip: false,
};

/** A user's playback preferences; the defaults until they pick anything. */
export async function getPlaybackPreferences(userId: string): Promise<PlaybackPreferences> {
	const [row] = await db
		.select()
		.from(playbackPreference)
		.where(eq(playbackPreference.userId, userId))
		.limit(1);

	return row ? toPreferences(row) : defaults;
}

/**
 * Changes a user's playback preferences and returns them as they now stand.
 *
 * @throws {@link InvalidInputError} when the update fails
 *   {@link PlaybackPreferencesUpdateSchema}.
 */
export async function updatePlaybackPreferences(
	userId: string,
	update: PlaybackPreferencesUpdate,
): Promise<PlaybackPreferences> {
	const parsed = PlaybackPreferencesUpdateSchema.safeParse(update);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid playback preferences", {
			cause: parsed.error,
		});
	}

	const { audio, subtitles, autoSkip } = parsed.data;
	const [row] = await db
		.insert(playbackPreference)
		.values({
			userId,
			audio: audio ?? null,
			subtitles: subtitles ?? {},
			autoSkip: autoSkip ?? false,
		})
		.onConflictDoUpdate({
			target: playbackPreference.userId,
			set: {
				...(audio !== undefined && {
					audio,
				}),
				...(subtitles && {
					subtitles: sql`${playbackPreference.subtitles} || excluded.subtitles`,
				}),
				...(autoSkip !== undefined && {
					autoSkip,
				}),
				updatedAt: sql`now()`,
			},
		})
		.returning();

	return toPreferences(row!);
}

function toPreferences(row: typeof playbackPreference.$inferSelect): PlaybackPreferences {
	const audio = z.enum(["sub", "dub", "raw"]).safeParse(row.audio);
	const subtitles = SubtitlesSchema.safeParse(row.subtitles);

	return {
		audio: audio.success ? audio.data : null,
		subtitles: subtitles.success ? subtitles.data : {},
		autoSkip: row.autoSkip,
	};
}
