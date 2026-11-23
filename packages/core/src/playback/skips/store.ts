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
 * What identifies one video. Stream URLs expire and hosts rotate, but a
 * stream's path stays the same, and sub and dub are different videos.
 */
export const videoKey = (playlistUrl: string) =>
	createHash("sha256").update(new URL(playlistUrl).pathname).digest("hex").slice(0, 32);

/**
 * What marks an episode's videos as looked at, so looking ahead to it can
 * pass it over without resolving its videos.
 */
export const episodeDetectionKey = (seriesId: string, episode: number) =>
	createHash("sha256").update(`episode:${seriesId}:${episode}`).digest("hex").slice(0, 32);

/**
 * Whether a video has not been looked at, or left something unsettled long
 * enough ago to look again; whether the songs have changed since is up to
 * the one looking.
 */
export const isDue = (stored: StoredSkipDetection | undefined) => {
	/**
	 * How long until a video is looked at again when something was left
	 * unsettled: AnimeThemes had no songs for its episode, or a kind's song was
	 * not found. Songs are added while a season airs, so a new opening may not
	 * be there yet.
	 */
	const unsettledRetryMs = 14 * day;

	if (!stored) {
		return true;
	}

	const settled =
		stored.songs > 0 && stored.detection.opening !== null && stored.detection.ending !== null;

	return !settled && Date.now() - stored.checkedAt.getTime() >= unsettledRetryMs;
};

/** What is stored for each of `keys` that has been looked at. */
export const loadDetections = async (keys: string[]) => {
	const found = new Map<string, StoredSkipDetection>();

	if (keys.length === 0) {
		return found;
	}

	const rows = await db.select().from(skipDetection).where(inArray(skipDetection.key, keys));

	// Spans are stored as 4-byte floats, so they are read back to the tenth of a
	// second they were stored at.
	for (const row of rows) {
		let ending: SongSpan | null = null;
		let opening: SongSpan | "none" | null = null;

		if (row.endingStart !== null && row.endingEnd !== null) {
			ending = {
				end: Math.round(row.endingEnd * 10) / 10,
				start: Math.round(row.endingStart * 10) / 10,
			};
		}

		if (row.openingStart !== null && row.openingEnd !== null) {
			opening = {
				end: Math.round(row.openingEnd * 10) / 10,
				start: Math.round(row.openingStart * 10) / 10,
			};
		}

		if (row.noOpening) {
			opening = "none";
		}

		found.set(row.key, {
			checkedAt: row.checkedAt,
			detection: {
				ending,
				opening,
			},
			songs: row.songs,
		});
	}

	return found;
};

/** Stores what looking for a video's theme songs settled. */
export const saveDetection = async (key: string, detection: SkipDetection, songs: number) => {
	let opening: SongSpan | null = null;

	if (detection.opening !== "none") {
		({ opening } = detection);
	}

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
