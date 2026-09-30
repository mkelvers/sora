import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { libraryEntry } from "../../database/schema";
import type { SeriesCard } from "../../series/models";
import { assertSeriesExists, toSeriesCards } from "../../series/queries";
import { seriesProgress, type SeriesProgress } from "../progress/resume";
import { loadCheckpoints, loadTitles } from "../progress/titles";
import { statusFor } from "./status";

/**
 * Where a user is with a whole series. The user never sets it; it follows
 * what they do (see `statusFor`):
 *
 * - `planning`: they added it to their library and have not started it.
 * - `watching`: they started it, and it is not {@link SeriesProgress.finished}.
 * - `completed`: they finished every main season they started, none of
 *   which is still airing. Films, OVAs, and seasons they have not started
 *   never hold it back; starting such a season makes it `watching` again.
 * - `dropped`: they gave up on it. The only status they set themselves; it
 *   keeps what they watched but leaves the series out of notifications and
 *   "continue watching", and counts it against their taste. Playing it
 *   again picks it back up.
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
}

/** A series' place in a user's library. */
export interface LibraryEntry {
	/** The series' status, or `null` when it is not in their library. */
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
	const entries = await db.select().from(libraryEntry).where(eq(libraryEntry.userId, userId));

	const seriesIds = entries.map((entry) => entry.seriesId);
	const [titles, checkpoints] = await Promise.all([
		loadTitles(seriesIds),
		loadCheckpoints(userId, seriesIds),
	]);
	const cards = await toSeriesCards([...titles.series.values()]);

	const items = entries.flatMap((entry): LibraryItem[] => {
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
	});
	await settleStale(userId, items);
	items.sort((left, right) => activeAt(right).localeCompare(activeAt(left)));

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
	if (!entry) {
		return {
			status: null,
			addedAt: null,
			updatedAt: null,
		};
	}

	const [titles, checkpoints] = await Promise.all([
		loadTitles([seriesId]),
		loadCheckpoints(userId, [seriesId]),
	]);
	const item = {
		series: {
			id: seriesId,
		},
		status: entry.status,
		updatedAt: entry.updatedAt.toISOString(),
		progress: seriesProgress(
			titles.episodes(seriesId),
			checkpoints.get(seriesId) ?? [],
			titles.seasonTitles,
		),
	};
	await settleStale(userId, [item]);

	return {
		status: item.status,
		addedAt: entry.createdAt.toISOString(),
		updatedAt: item.updatedAt,
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
 * Drops a series: the user gave up on it. What they watched stays, and the
 * series stays in the library as `dropped`, out of notifications and
 * "continue watching". A series not in the library is put in it dropped.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function dropTitle(userId: string, seriesId: string) {
	await assertSeriesExists(seriesId);
	const now = new Date();
	await db
		.insert(libraryEntry)
		.values({
			userId,
			seriesId,
			status: "dropped",
			createdAt: now,
			updatedAt: now,
		})
		.onConflictDoUpdate({
			target: [libraryEntry.userId, libraryEntry.seriesId],
			set: {
				status: "dropped",
				updatedAt: now,
			},
			setWhere: ne(libraryEntry.status, "dropped"),
		});
}

/**
 * Picks a dropped series back up: its status follows the user's progress
 * again (see `statusFor`). A series not dropped is left as it is.
 */
export async function pickUpTitle(userId: string, seriesId: string) {
	const [[entry], titles, checkpoints] = await Promise.all([
		db
			.select({
				status: libraryEntry.status,
			})
			.from(libraryEntry)
			.where(and(eq(libraryEntry.userId, userId), eq(libraryEntry.seriesId, seriesId)))
			.limit(1),
		loadTitles([seriesId]),
		loadCheckpoints(userId, [seriesId]),
	]);
	if (entry?.status !== "dropped") {
		return;
	}

	const status =
		statusFor(
			"planning",
			seriesProgress(
				titles.episodes(seriesId),
				checkpoints.get(seriesId) ?? [],
				titles.seasonTitles,
			),
			[],
		) ?? "planning";
	await db
		.update(libraryEntry)
		.set({
			status,
			updatedAt: new Date(),
		})
		.where(and(eq(libraryEntry.userId, userId), eq(libraryEntry.seriesId, seriesId)));
}

/**
 * Brings a series' status in line with the user's progress after they
 * played or marked episodes of the `touched` seasons (see `statusFor`).
 * Playing a series puts it in the library; marking episodes of one not in it
 * unwatched does not.
 */
export async function settleStatus(userId: string, seriesId: string, touched: readonly string[]) {
	const [[entry], titles, checkpoints] = await Promise.all([
		db
			.select({
				status: libraryEntry.status,
			})
			.from(libraryEntry)
			.where(and(eq(libraryEntry.userId, userId), eq(libraryEntry.seriesId, seriesId)))
			.limit(1),
		loadTitles([seriesId]),
		loadCheckpoints(userId, [seriesId]),
	]);
	const current = entry?.status ?? null;
	const status = statusFor(
		current,
		seriesProgress(titles.episodes(seriesId), checkpoints.get(seriesId) ?? [], titles.seasonTitles),
		touched,
	);
	if (status === null || status === current) {
		return;
	}

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
		});
}

/**
 * Stores the status items' progress calls for when it moved on without the
 * user doing anything, such as a season they finished watching since
 * finishing airing, and updates the items to match.
 */
async function settleStale(
	userId: string,
	items: {
		series: Pick<SeriesCard, "id">;
		status: LibraryStatus;
		updatedAt: string;
		progress: SeriesProgress;
	}[],
) {
	const now = new Date();
	const changed = new Map<LibraryStatus, string[]>();
	for (const item of items) {
		const status = statusFor(item.status, item.progress, []) ?? item.status;
		if (status !== item.status) {
			item.status = status;
			item.updatedAt = now.toISOString();
			changed.set(status, [...(changed.get(status) ?? []), item.series.id]);
		}
	}

	await Promise.all(
		[...changed].map(([status, seriesIds]) =>
			db
				.update(libraryEntry)
				.set({
					status,
					updatedAt: now,
				})
				.where(and(eq(libraryEntry.userId, userId), inArray(libraryEntry.seriesId, seriesIds))),
		),
	);
}

/** When a user last did anything with a series in their library: watched it or its status changed. */
function activeAt(item: LibraryItem) {
	const watchedAt = item.progress.lastWatchedAt;
	return watchedAt !== null && watchedAt > item.updatedAt ? watchedAt : item.updatedAt;
}
