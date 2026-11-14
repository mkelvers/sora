import { createHash } from "node:crypto";

import { day } from "@sora/shared";
import { inArray } from "drizzle-orm";

import { db } from "../../database/client";
import { skipDetection } from "../../database/schema/playback";

/** Where a theme song plays in a video, in seconds. */
export interface SongSpan {
	start: number;
	end: number;
}

/**
 * What looking for an episode's theme songs in one video settled, per kind:
 * where the song plays, `"none"` when the opening song plays only late in
 * the video (over the story, or as its ending), so there is no opening to
 * skip, or `null` when nothing was settled and the provider's segment stands.
 */
export interface SkipDetection {
	opening: SongSpan | "none" | null;
	ending: SongSpan | null;
}

/** A stored {@link SkipDetection}, with what decides when to look again. */
export interface StoredSkipDetection {
	detection: SkipDetection;
	/** Theme songs looked for; 0 when AnimeThemes had none for the episode. */
	songs: number;
	checkedAt: Date;
}

/**
 * How long until a video is looked at again when something was left
 * unsettled: AnimeThemes had no songs for its episode, or a kind's song was
 * not found. Songs are added while a season airs, so a new opening may not
 * be there yet.
 */
const unsettledRetryMs = 14 * day;

const hash = (text: string) => createHash("sha256").update(text).digest("hex").slice(0, 32);

/**
 * What identifies one video. Stream URLs expire and hosts rotate, but a
 * stream's path stays the same, and sub and dub are different videos.
 */
export const skipDetectionKey = (playlistUrl: string) => hash(new URL(playlistUrl).pathname);

/**
 * What marks an episode's videos as looked at, so looking ahead to it can
 * pass it over without resolving its videos.
 */
export const episodeDetectionKey = (seriesId: string, episode: number) =>
	hash(`episode:${seriesId}:${episode}`);

/**
 * Whether a video has not been looked at, or left something unsettled long
 * enough ago to look again; whether the songs have changed since is up to
 * the one looking.
 */
export const isSkipDetectionDue = (stored: StoredSkipDetection | undefined) => {
	if (!stored) {
		return true;
	}
	const settled =
		stored.songs > 0 && stored.detection.opening !== null && stored.detection.ending !== null;
	return !settled && Date.now() - stored.checkedAt.getTime() >= unsettledRetryMs;
};

/** Stored as 4-byte floats, so read back to the tenth of a second they were stored at. */
const tenths = (seconds: number) => Math.round(seconds * 10) / 10;

const span = (start: number | null, end: number | null) =>
	start === null || end === null
		? null
		: {
				end: tenths(end),
				start: tenths(start),
			};

/** What is stored for each of `keys` that has been looked at. */
export const getSkipDetections = async (keys: string[]) => {
	const found = new Map<string, StoredSkipDetection>();
	if (keys.length === 0) {
		return found;
	}

	const rows = await db.select().from(skipDetection).where(inArray(skipDetection.key, keys));
	for (const row of rows) {
		found.set(row.key, {
			checkedAt: row.checkedAt,
			detection: {
				ending: span(row.endingStart, row.endingEnd),
				opening: row.noOpening ? "none" : span(row.openingStart, row.openingEnd),
			},
			songs: row.songs,
		});
	}
	return found;
};

/** Stores what looking for a video's theme songs settled. */
export const saveSkipDetection = async (key: string, detection: SkipDetection, songs: number) => {
	const opening = detection.opening === "none" ? null : detection.opening;
	const row = {
		checkedAt: new Date(),
		endingEnd: detection.ending?.end ?? null,
		endingStart: detection.ending?.start ?? null,
		noOpening: detection.opening === "none",
		openingEnd: opening?.end ?? null,
		openingStart: opening?.start ?? null,
		songs,
	};
	await db
		.insert(skipDetection)
		.values({
			key,
			...row,
		})
		.onConflictDoUpdate({
			set: row,
			target: skipDetection.key,
		});
};
