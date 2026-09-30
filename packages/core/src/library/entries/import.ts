import { and, eq, inArray, isNotNull, not, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import {
	anime,
	animeSearch,
	libraryEntry,
	libraryImport,
	seriesEntry,
	seriesEpisode,
	seriesSeason,
} from "../../database/schema";
import { InvalidInputError } from "../../errors";
import { scheduleSeriesStore } from "../../scheduler/queue";
import {
	defaultEpisodeSeconds,
	writeCheckpoints,
	type CheckpointInput,
} from "../progress/progress";
import { seriesProgress } from "../progress/resume";
import { loadCheckpoints, loadTitles } from "../progress/titles";
import { settleStatus, type LibraryStatus } from "./entries";
import { statusFor } from "./status";

/** A watchlist exported from Arc, as Arc writes it. */
export const ArcWatchlistSchema = z.object({
	schema_version: z.literal("1.0"),
	entries: z
		.array(
			z.object({
				anilist_id: z.number().int().positive(),
				status: z.enum(["plan_to_watch", "watching", "completed"]),
				added_at: z.iso.datetime(),
				updated_at: z.iso.datetime(),
			}),
		)
		.max(10_000),
});

export type ArcWatchlist = z.input<typeof ArcWatchlistSchema>;

/** What {@link importArcWatchlist} did with a watchlist's entries. */
export interface WatchlistImport {
	/** Entries now in the library. */
	imported: number;
	/** Entries whose series is being stored; they are added once it is. */
	waiting: number;
	/** Entries AniList does not have, or adult ones. */
	notFound: number;
}

const arcStatuses: Record<ArcWatchlist["entries"][number]["status"], LibraryStatus> = {
	plan_to_watch: "planning",
	watching: "planning",
	completed: "completed",
};

/**
 * Imports a watchlist exported from Arc. Statuses are not copied, since a
 * status follows progress: a completed entry has every episode that aired
 * by the time it was completed marked watched, and the status settles
 * from that. Arc does not say how far a `watching` entry got, so it is
 * added like a planned one.
 *
 * Entries keep Arc's dates, so the library keeps its order, and marked
 * episodes are dated when the entry was completed. Nothing goes into the
 * user's history, and newer progress the user has in Sora wins. Series
 * already in the library keep when they were added.
 *
 * Entries whose series is not stored yet are kept and applied once it is
 * (see {@link applyLibraryImports}); their series are queued to be stored.
 * Importing the same watchlist again changes nothing.
 *
 * @throws {@link InvalidInputError} when the file is not an Arc watchlist.
 */
export async function importArcWatchlist(
	userId: string,
	watchlist: unknown,
): Promise<WatchlistImport> {
	const parsed = ArcWatchlistSchema.safeParse(watchlist);
	if (!parsed.success) {
		throw new InvalidInputError("Not an Arc watchlist export", {
			cause: parsed.error,
		});
	}

	const entries = new Map(
		parsed.data.entries
			.toSorted((left, right) => left.updated_at.localeCompare(right.updated_at))
			.map((entry) => [entry.anilist_id, entry]),
	);
	if (entries.size === 0) {
		return {
			imported: 0,
			waiting: 0,
			notFound: 0,
		};
	}

	const known = await db
		.select({
			anilistId: animeSearch.anilistId,
		})
		.from(animeSearch)
		.where(and(inArray(animeSearch.anilistId, [...entries.keys()]), not(animeSearch.isAdult)));
	const knownIds = known.map((row) => row.anilistId);

	if (knownIds.length > 0) {
		await db
			.insert(libraryImport)
			.values(
				knownIds.map((anilistId) => {
					const entry = entries.get(anilistId)!;
					return {
						userId,
						anilistId,
						status: arcStatuses[entry.status],
						addedAt: new Date(entry.added_at),
						updatedAt: new Date(entry.updated_at),
					};
				}),
			)
			.onConflictDoUpdate({
				target: [libraryImport.userId, libraryImport.anilistId],
				set: {
					status: sql`excluded.status`,
					addedAt: sql`excluded.added_at`,
					updatedAt: sql`excluded.updated_at`,
				},
			});
	}

	const applied = await applyLibraryImports({
		userId,
	});
	const waiting = knownIds.filter((anilistId) => !applied.has(anilistId));
	for (const anilistId of waiting) {
		await scheduleSeriesStore(anilistId, "current");
	}

	return {
		imported: knownIds.length - waiting.length,
		waiting: waiting.length,
		notFound: entries.size - knownIds.length,
	};
}

/**
 * Applies imported watchlist entries whose series is stored, of one user
 * or of some AniList entries, such as those of a series just stored, and
 * removes them. See {@link importArcWatchlist}.
 *
 * @returns The AniList IDs of the entries applied.
 */
export async function applyLibraryImports(filter: {
	userId?: string;
	anilistIds?: readonly number[];
}): Promise<Set<number>> {
	if (filter.anilistIds?.length === 0) {
		return new Set();
	}

	const rows = await db
		.select({
			entry: libraryImport,
			seriesId: seriesEntry.seriesId,
		})
		.from(libraryImport)
		.innerJoin(seriesEntry, eq(seriesEntry.anilistId, libraryImport.anilistId))
		.where(
			and(
				filter.userId === undefined ? undefined : eq(libraryImport.userId, filter.userId),
				filter.anilistIds === undefined
					? undefined
					: inArray(libraryImport.anilistId, [...filter.anilistIds]),
			),
		);

	const byUser = Map.groupBy(rows, (row) => row.entry.userId);
	for (const [userId, imported] of byUser) {
		await applyForUser(userId, imported);
		await db.delete(libraryImport).where(
			and(
				eq(libraryImport.userId, userId),
				inArray(
					libraryImport.anilistId,
					imported.map((row) => row.entry.anilistId),
				),
			),
		);
	}

	return new Set(rows.map((row) => row.entry.anilistId));
}

async function applyForUser(
	userId: string,
	imported: {
		entry: typeof libraryImport.$inferSelect;
		seriesId: string;
	}[],
) {
	const completed = imported.filter((row) => row.entry.status === "completed");
	const episodes = await airedEpisodes(completed.map((row) => row.entry));
	const touched = new Map<string, Set<string>>();
	const checkpoints: CheckpointInput[] = [];
	for (const { entry, seriesId } of completed) {
		const marked = episodes.get(entry.anilistId) ?? [];
		for (const [index, episode] of marked.entries()) {
			const seconds = (episode.runtimeMinutes ?? 0) * 60 || defaultEpisodeSeconds;
			checkpoints.push({
				anilistId: entry.anilistId,
				episode: episode.anilistEpisode,
				positionSeconds: seconds,
				durationSeconds: seconds,
				watched: true,
				// Episodes completed at once, in order, a millisecond apart, the last when the entry was.
				eventAt: new Date(entry.updatedAt.getTime() - marked.length + index + 1),
			});
			touched.set(seriesId, (touched.get(seriesId) ?? new Set()).add(episode.seasonId));
		}
	}
	await writeCheckpoints(userId, checkpoints);

	const seriesIds = [...new Set(imported.map((row) => row.seriesId))];
	const existing = await db
		.select({
			seriesId: libraryEntry.seriesId,
		})
		.from(libraryEntry)
		.where(and(eq(libraryEntry.userId, userId), inArray(libraryEntry.seriesId, seriesIds)));
	const listed = new Set(existing.map((row) => row.seriesId));

	for (const seriesId of listed) {
		const seasons = touched.get(seriesId);
		if (seasons) {
			await settleStatus(userId, seriesId, [...seasons]);
		}
	}

	const added = seriesIds.filter((seriesId) => !listed.has(seriesId));
	if (added.length === 0) {
		return;
	}

	const [titles, progress] = await Promise.all([loadTitles(added), loadCheckpoints(userId, added)]);
	await db
		.insert(libraryEntry)
		.values(
			added.map((seriesId) => {
				const entries = imported.filter((row) => row.seriesId === seriesId).map((row) => row.entry);
				const status = statusFor(
					"planning",
					seriesProgress(
						titles.episodes(seriesId),
						progress.get(seriesId) ?? [],
						titles.seasonTitles,
					),
					[...(touched.get(seriesId) ?? [])],
				);
				return {
					userId,
					seriesId,
					status: status ?? "planning",
					createdAt: new Date(Math.min(...entries.map((entry) => entry.addedAt.getTime()))),
					updatedAt: new Date(Math.max(...entries.map((entry) => entry.updatedAt.getTime()))),
				};
			}),
		)
		.onConflictDoNothing();
}

/**
 * The episodes of each completed entry that had aired when it was
 * completed, in order. An episode without an air date counts once its
 * entry has finished airing.
 */
async function airedEpisodes(entries: readonly (typeof libraryImport.$inferSelect)[]) {
	const byEpisode = new Map<
		number,
		{
			seasonId: string;
			anilistEpisode: number;
			runtimeMinutes: number | null;
		}[]
	>();
	if (entries.length === 0) {
		return byEpisode;
	}

	const completedAt = new Map(entries.map((entry) => [entry.anilistId, entry.updatedAt]));
	const rows = await db
		.select({
			seasonId: seriesSeason.id,
			anilistId: seriesEpisode.anilistId,
			anilistEpisode: seriesEpisode.anilistEpisode,
			runtimeMinutes: seriesEpisode.runtimeMinutes,
			airedAt: seriesEpisode.airedAt,
			airDate: seriesEpisode.airDate,
			entryStatus: anime.status,
		})
		.from(seriesEpisode)
		.innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
		.leftJoin(anime, eq(anime.anilistId, seriesEpisode.anilistId))
		.where(
			and(
				inArray(seriesEpisode.anilistId, [...completedAt.keys()]),
				isNotNull(seriesEpisode.anilistEpisode),
			),
		);

	for (const row of rows.toSorted((left, right) => left.anilistEpisode! - right.anilistEpisode!)) {
		const aired = row.airedAt ?? (row.airDate ? new Date(`${row.airDate}T00:00:00.000Z`) : null);
		const counts =
			aired === null ? row.entryStatus === "FINISHED" : aired <= completedAt.get(row.anilistId!)!;
		const known = byEpisode
			.get(row.anilistId!)
			?.some((episode) => episode.anilistEpisode === row.anilistEpisode);
		if (counts && !known) {
			byEpisode.set(row.anilistId!, [
				...(byEpisode.get(row.anilistId!) ?? []),
				{
					seasonId: row.seasonId,
					anilistEpisode: row.anilistEpisode!,
					runtimeMinutes: row.runtimeMinutes,
				},
			]);
		}
	}

	return byEpisode;
}
