import { and, count, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { libraryEntry, libraryImport } from "../../database/schema";
import type { SeriesCard } from "../../series/models";
import { assertSeriesExists, toSeriesCards } from "../../series/queries";
import { day } from "../../time";
import { seriesProgress, type SeriesProgress } from "../progress/resume";
import { loadCheckpoints, loadTitles } from "../progress/titles";

/**
 * A user's relationship to a whole series, which only they set, apart from
 * a `planning` series becoming `watching` once they start it (see
 * {@link markStarted}). It is never read from progress: a `completed`
 * series stays completed when a new season comes out, and one they are
 * caught up on stays `watching` until they say otherwise.
 */
export const LibraryStatusSchema = z.enum(["planning", "watching", "completed", "dropped"]);

export type LibraryStatus = z.infer<typeof LibraryStatusSchema>;

/** One series in a user's library, with its card and how far they are through it. */
export interface LibraryItem {
	series: SeriesCard;
	status: LibraryStatus;
	/** ISO 8601 timestamp. */
	addedAt: string;
	/** ISO 8601 timestamp of when the status last changed. */
	updatedAt: string;
	progress: SeriesProgress;
}

/** A user's library, and how many of its series have each status. */
export interface Library {
	items: LibraryItem[];
	counts: Record<LibraryStatus, number>;
	/** Imported titles still being prepared, which join the library once they are. */
	preparing: number;
}

/** A series' place in a user's library. */
export interface LibraryEntry {
	/** The status the user gave the series, or `null` when it is not in their library. */
	status: LibraryStatus | null;
	/** ISO 8601 timestamp, or `null` when not in the library. */
	addedAt: string | null;
	/** ISO 8601 timestamp of when the status last changed, or `null` when not in the library. */
	updatedAt: string | null;
}

/**
 * Lists a user's library, most recently active first: last watched, or
 * else when its status last changed.
 */
export async function getLibrary(
	userId: string,
	filter: {
		status?: LibraryStatus;
	} = {},
): Promise<Library> {
	await resolveImportedEntries(userId);
	const [entries, [pending]] = await Promise.all([
		db.select().from(libraryEntry).where(eq(libraryEntry.userId, userId)),
		db
			.select({
				count: count(),
			})
			.from(libraryImport)
			.where(eq(libraryImport.userId, userId)),
	]);

	const seriesIds = entries.map((entry) => entry.seriesId);
	const [titles, checkpoints] = await Promise.all([
		loadTitles(seriesIds),
		loadCheckpoints(userId, seriesIds),
	]);
	const cards = await toSeriesCards([...titles.series.values()]);

	const items = entries
		.flatMap((entry): LibraryItem[] => {
			const card = cards.get(entry.seriesId);
			return card
				? [
						{
							series: card,
							status: entry.status,
							addedAt: entry.createdAt.toISOString(),
							updatedAt: entry.updatedAt.toISOString(),
							progress: seriesProgress(
								titles.episodes(entry.seriesId),
								checkpoints.get(entry.seriesId) ?? [],
								titles.seasonTitles,
							),
						},
					]
				: [];
		})
		.sort((left, right) => activeAt(right).localeCompare(activeAt(left)));

	const counts: Record<LibraryStatus, number> = {
		planning: 0,
		watching: 0,
		completed: 0,
		dropped: 0,
	};
	for (const item of items) {
		counts[item.status] += 1;
	}

	return {
		items: filter.status ? items.filter((item) => item.status === filter.status) : items,
		counts,
		preparing: pending?.count ?? 0,
	};
}

/**
 * A series' place in a user's library, in it or not.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getLibraryEntry(userId: string, seriesId: string): Promise<LibraryEntry> {
	await assertSeriesExists(seriesId);
	const [entry] = await db
		.select()
		.from(libraryEntry)
		.where(and(eq(libraryEntry.userId, userId), eq(libraryEntry.seriesId, seriesId)))
		.limit(1);

	return {
		status: entry?.status ?? null,
		addedAt: entry?.createdAt.toISOString() ?? null,
		updatedAt: entry?.updatedAt.toISOString() ?? null,
	};
}

/**
 * Puts a series in the library as `planning`. A series already in it keeps
 * its status.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function addToLibrary(userId: string, seriesId: string) {
	await assertSeriesExists(seriesId);
	await db
		.insert(libraryEntry)
		.values({
			userId,
			seriesId,
			status: "planning",
		})
		.onConflictDoNothing();
}

/**
 * Sets the status of a series, putting it in the library if it is not.
 * Nothing about its episodes changes.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function setLibraryStatus(userId: string, seriesId: string, status: LibraryStatus) {
	await assertSeriesExists(seriesId);
	const now = new Date();
	await db
		.insert(libraryEntry)
		.values({
			userId,
			seriesId,
			status,
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [libraryEntry.userId, libraryEntry.seriesId],
			set: {
				status,
				updatedAt: now,
			},
			setWhere: sql`${libraryEntry.status} <> excluded.status`,
		});
}

/**
 * Removes a series from the library. Its episode states and history stay.
 *
 * @returns Whether the series was in the library.
 */
export async function removeFromLibrary(userId: string, seriesId: string): Promise<boolean> {
	const removed = await db
		.delete(libraryEntry)
		.where(and(eq(libraryEntry.userId, userId), eq(libraryEntry.seriesId, seriesId)))
		.returning({
			seriesId: libraryEntry.seriesId,
		});

	return removed.length > 0;
}

/**
 * Records that a user started watching a series: it joins their library as
 * `watching`, or moves there from `planning`. `completed` and
 * `dropped` are left to the user.
 */
export async function markStarted(userId: string, seriesId: string) {
	const now = new Date();
	await db
		.insert(libraryEntry)
		.values({
			userId,
			seriesId,
			status: "watching",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [libraryEntry.userId, libraryEntry.seriesId],
			set: {
				status: "watching",
				updatedAt: now,
			},
			setWhere: eq(libraryEntry.status, "planning"),
		});
}

/**
 * Imported entries still waiting for their series after this long are
 * given up on: the entry could not be laid out, such as adult media.
 */
const importPatienceMs = day;

/**
 * Moves the imported entries whose series are stored by now into the
 * library. A series imported through one entry takes its status; one
 * imported through several takes their status when they agree, and
 * `watching` otherwise. A series already in the library keeps its status. Entries
 * still waiting after {@link importPatienceMs} are given up on.
 */
export async function resolveImportedEntries(userId: string) {
	await db
		.delete(libraryImport)
		.where(
			and(
				eq(libraryImport.userId, userId),
				lt(libraryImport.createdAt, new Date(Date.now() - importPatienceMs)),
			),
		);
	await db.execute(sql`
    with resolved as (
      delete from library_import as imported
      using series_entry as entry
      where imported.user_id = ${userId} and entry.anilist_id = imported.anilist_id
      returning entry.series_id, imported.status, imported.created_at
    )
    insert into library_entry (user_id, series_id, status, created_at, updated_at)
    select ${userId}, series_id,
      case
        when count(distinct status) = 1 then min(status)
        else 'watching'::library_status
      end,
      min(created_at), now()
    from resolved
    group by series_id
    on conflict (user_id, series_id) do nothing
  `);
}

/** When a user last did anything with a series in their library: watched it or changed its status. */
function activeAt(item: LibraryItem) {
	const watchedAt = item.progress.lastWatchedAt;
	return watchedAt !== null && watchedAt > item.updatedAt ? watchedAt : item.updatedAt;
}
