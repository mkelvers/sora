import { eq, inArray, lt, notExists, notInArray, sql } from "drizzle-orm";

import { db } from "../../database/client";
import {
	episodeRelease,
	libraryEntry,
	notificationDismissal,
	notificationRead,
	releaseWatch,
	seriesEntry,
	seriesEpisode,
} from "../../database/schema";
import { anilistEpisodeKey } from "../../series/episodes";
import { loadTitles } from "../progress/titles";
import { notificationLifetimeMs } from "./notifications";

/**
 * Records the episodes that came out for the series in anyone's library,
 * which notifications are read from (see `getNotifications`).
 *
 * An episode counts once its season lists it and it can be played, as the
 * resume rules see it (see `loadTitles`): AniKoto carries it and it has its
 * details. Each is recorded once, at when it was first seen, so episodes
 * that come out together make one notification. A series seen for the first
 * time is watched from then on; what it already listed is no news.
 *
 * Series no library holds any more are no longer watched, and what was
 * recorded for them goes, so one added again is watched afresh.
 *
 * @returns How many episodes came out since the last run.
 */
export async function recordReleases(now = new Date()): Promise<number> {
	await forgetUnwatched(now);

	const listed = await db
		.selectDistinct({
			seriesId: libraryEntry.seriesId,
		})
		.from(libraryEntry);
	const seriesIds = listed.map((row) => row.seriesId);
	if (seriesIds.length === 0) {
		return 0;
	}

	const [titles, watched] = await Promise.all([
		loadTitles(seriesIds),
		db
			.select({
				seriesId: releaseWatch.seriesId,
			})
			.from(releaseWatch)
			.where(inArray(releaseWatch.seriesId, seriesIds)),
	]);
	const listedEpisodes = seriesIds.flatMap((seriesId) =>
		titles.episodes(seriesId).map((episode) => ({
			seriesId,
			...episode,
		})),
	);
	const located = listedEpisodes.length
		? await db
				.select({
					seasonId: seriesEpisode.seasonId,
					number: seriesEpisode.number,
					anilistId: seriesEpisode.anilistId,
					anilistEpisode: seriesEpisode.anilistEpisode,
				})
				.from(seriesEpisode)
				.where(
					inArray(seriesEpisode.seasonId, [
						...new Set(listedEpisodes.map((episode) => episode.seasonId)),
					]),
				)
		: [];
	const anilistEpisodes = new Map(
		located.flatMap((row) =>
			row.anilistId === null || row.anilistEpisode === null
				? []
				: [
						[
							`${row.seasonId}:${row.number}`,
							{
								anilistId: row.anilistId,
								anilistEpisode: row.anilistEpisode,
							},
						],
					],
		),
	);
	const released = listedEpisodes.flatMap((episode): ListedRelease[] => {
		const anilist = anilistEpisodes.get(`${episode.seasonId}:${episode.number}`);
		return anilist && episode.isReleased && !episode.isExtra
			? [
					{
						seriesId: episode.seriesId,
						...anilist,
					},
				]
			: [];
	});

	const anilistIds = [...new Set(released.map((episode) => episode.anilistId))];
	const recorded = anilistIds.length
		? await db
				.select({
					anilistId: episodeRelease.anilistId,
					anilistEpisode: episodeRelease.anilistEpisode,
				})
				.from(episodeRelease)
				.where(inArray(episodeRelease.anilistId, anilistIds))
		: [];

	const plan = planReleases(
		seriesIds,
		released,
		new Set(watched.map((row) => row.seriesId)),
		new Set(recorded.map((row) => anilistEpisodeKey(row.anilistId, row.anilistEpisode))),
		now,
	);

	await db.transaction(async (tx) => {
		if (plan.watch.length > 0) {
			await tx
				.insert(releaseWatch)
				.values(
					plan.watch.map((seriesId) => ({
						seriesId,
						since: now,
					})),
				)
				.onConflictDoNothing();
		}

		if (plan.releases.length > 0) {
			await tx.insert(episodeRelease).values(plan.releases).onConflictDoNothing();
		}
	});

	return plan.releases.filter((release) => release.news).length;
}

/** An episode a season lists and can be played, by its AniList episode. */
export interface ListedRelease {
	seriesId: string;
	anilistId: number;
	anilistEpisode: number;
}

/**
 * Decides what {@link recordReleases} writes: the listed series to start
 * watching, and the released episodes not recorded yet. An episode of a
 * series already watched is news; one of a series seen for the first time
 * was out already, and only marks where watching starts.
 *
 * @param watched - The series already watched for releases.
 * @param recorded - The episodes already recorded, by `anilistEpisodeKey`.
 */
export function planReleases(
	seriesIds: readonly string[],
	released: readonly ListedRelease[],
	watched: ReadonlySet<string>,
	recorded: ReadonlySet<string>,
	now: Date,
): {
	watch: string[];
	releases: (typeof episodeRelease.$inferInsert)[];
} {
	const releases = new Map<string, typeof episodeRelease.$inferInsert>();
	for (const episode of released) {
		const key = anilistEpisodeKey(episode.anilistId, episode.anilistEpisode);
		if (!recorded.has(key) && !releases.has(key)) {
			releases.set(key, {
				anilistId: episode.anilistId,
				anilistEpisode: episode.anilistEpisode,
				releasedAt: now,
				news: watched.has(episode.seriesId),
			});
		}
	}

	return {
		watch: seriesIds.filter((seriesId) => !watched.has(seriesId)),
		releases: [...releases.values()],
	};
}

/**
 * Stops watching series no library holds, and forgets what was recorded for
 * them. Deleted and read notifications old enough to no longer be listed go too.
 */
async function forgetUnwatched(now: Date) {
	const listed = db
		.select({
			seriesId: libraryEntry.seriesId,
		})
		.from(libraryEntry);

	await db.transaction(async (tx) => {
		await tx
			.delete(notificationDismissal)
			.where(
				lt(notificationDismissal.dismissedAt, new Date(now.getTime() - notificationLifetimeMs)),
			);
		await tx
			.delete(notificationRead)
			.where(lt(notificationRead.readAt, new Date(now.getTime() - notificationLifetimeMs)));
		await tx.delete(releaseWatch).where(notInArray(releaseWatch.seriesId, listed));
		await tx.delete(episodeRelease).where(
			notExists(
				tx
					.select({
						one: sql`1`,
					})
					.from(seriesEntry)
					.innerJoin(releaseWatch, eq(releaseWatch.seriesId, seriesEntry.seriesId))
					.where(eq(seriesEntry.anilistId, episodeRelease.anilistId)),
			),
		);
	});
}
