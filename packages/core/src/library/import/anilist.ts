import { sql } from "drizzle-orm";
import { z } from "zod";

import { anilist } from "../../anilist/client";
import { UserAnimeListDocument, type MediaListStatus } from "../../anilist/graphql.generated";
import { db } from "../../database/client";
import { libraryImport } from "../../database/schema";
import { AniListListNotFoundError, InvalidInputError } from "../../errors";
import { scheduleSeriesStore } from "../../scheduler/queue";
import { storedSeriesIds } from "../../series/store";
import { minute } from "../../time";
import { resolveImportedEntries, type LibraryStatus } from "../entries/entries";
import { writeCheckpoints, type CheckpointInput } from "../progress/progress";

/** Length assumed for an imported episode when AniList does not know it. */
const defaultEpisodeMinutes = 24;

/** Import rows per insert, well under PostgreSQL's limit of 65,535 parameters. */
const importBatch = 1_000;

/** AniList user names: 2 to 20 letters and digits. */
export const AniListUserNameSchema = z
	.string()
	.trim()
	.regex(/^[A-Za-z0-9]{2,20}$/, "Not an AniList user name");

/** What {@link importAniListList} brought over. */
export interface ImportSummary {
	/** Entries on the AniList list. */
	entries: number;
	/** Episodes recorded as watched. */
	episodes: number;
	/** Entries whose titles are still being prepared; they join the library once they are. */
	preparing: number;
}

/**
 * Imports a user's public AniList anime list: every entry goes into the
 * library with its AniList status, and the episodes it records as watched
 * are marked watched. Nothing goes into the user's history, since nothing
 * was played here.
 *
 * - Completed and rewatching entries: every episode watched.
 * - Watching, paused, and dropped entries: episodes up to their progress.
 *   Paused entries go in as `watching`, as Sora has no paused status.
 * - Planning entries: no episodes.
 *
 * A title made of several AniList entries takes a status from all of them;
 * see {@link resolveImportedEntries}. A title already in the library keeps
 * its status. Episodes are recorded at when the entry last changed on
 * AniList, so anything watched here since is kept. Entries whose titles
 * are not stored yet are queued for the scheduler and join the library
 * once they are. Importing again brings over what changed.
 *
 * @throws {@link InvalidInputError} when the user name is not valid.
 * @throws {@link AniListListNotFoundError} when AniList has no public anime
 *   list under the name.
 * @throws {@link UpstreamUnavailableError} when AniList fails.
 */
export async function importAniListList(userId: string, userName: string): Promise<ImportSummary> {
	const parsed = AniListUserNameSchema.safeParse(userName);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid AniList user name", {
			cause: parsed.error,
		});
	}

	const { MediaListCollection } = await anilist(
		UserAnimeListDocument,
		{
			userName: parsed.data,
		},
		{
			maxAgeMs: minute,
		},
	);
	if (!MediaListCollection) {
		throw new AniListListNotFoundError(parsed.data);
	}

	const entries = (MediaListCollection.lists ?? []).flatMap((list) =>
		(list?.entries ?? []).flatMap((entry) => entry ?? []),
	);
	const checkpoints = entries.flatMap((entry): CheckpointInput[] => {
		const watched = watchedEpisodes(
			entry.status,
			entry.progress ?? 0,
			entry.media?.episodes ?? null,
		);
		const seconds = (entry.media?.duration ?? defaultEpisodeMinutes) * 60;
		const changedAt = (entry.updatedAt ?? 0) * 1000 || Date.now();
		// Each episode a millisecond after the one before, so the last one watched is the latest.
		return Array.from(
			{
				length: watched,
			},
			(_, index) => ({
				anilistId: entry.mediaId,
				episode: index + 1,
				positionSeconds: seconds,
				durationSeconds: seconds,
				watched: true,
				eventAt: new Date(changedAt - watched + index + 1),
			}),
		);
	});
	await writeCheckpoints(userId, checkpoints);

	const rows = entries.map((entry) => ({
		userId,
		anilistId: entry.mediaId,
		status: libraryStatus(entry.status),
	}));
	for (let start = 0; start < rows.length; start += importBatch) {
		await db
			.insert(libraryImport)
			.values(rows.slice(start, start + importBatch))
			.onConflictDoUpdate({
				target: [libraryImport.userId, libraryImport.anilistId],
				set: {
					status: sql`excluded.status`,
					createdAt: sql`excluded.created_at`,
				},
			});
	}
	await resolveImportedEntries(userId);

	const stored = await storedSeriesIds(entries.map((entry) => entry.mediaId));
	const missing = [
		...new Set(entries.map((entry) => entry.mediaId).filter((id) => !stored.has(id))),
	];
	for (const anilistId of missing) {
		await scheduleSeriesStore(anilistId, "current");
	}

	return {
		entries: entries.length,
		episodes: checkpoints.length,
		preparing: missing.length,
	};
}

/** The library status an AniList list status stands for. */
function libraryStatus(status: MediaListStatus | null): LibraryStatus {
	switch (status) {
		case "CURRENT":
		case "REPEATING":
		case "PAUSED":
			return "watching";
		case "COMPLETED":
			return "completed";
		case "DROPPED":
			return "dropped";
		default:
			return "planning";
	}
}

/** How many episodes of an entry, from the first, count as watched. */
function watchedEpisodes(
	status: MediaListStatus | null,
	progress: number,
	episodes: number | null,
) {
	switch (status) {
		case "COMPLETED":
		case "REPEATING":
			return Math.max(progress, episodes ?? 0);
		case "CURRENT":
		case "PAUSED":
		case "DROPPED":
			return progress;
		default:
			return 0;
	}
}
