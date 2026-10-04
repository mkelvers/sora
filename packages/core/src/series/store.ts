import { and, eq, inArray, not, or, sql } from "drizzle-orm";

import { getAnime } from "../catalog/queries/anime";
import { fetchEpisodeAirings } from "../catalog/queries/schedule";
import { db } from "../database/client";
import { animeSearch, series, seriesEpisode, seriesRelated } from "../database/schema";
import { newId } from "../ids";
import {
	scheduleEpisodeLookups,
	scheduleSeriesStore,
	startTrackingAiring,
} from "../scheduler/queue";
import { storeBackdropEdges } from "./edges";
import { anilistEpisodeKey, carriedByAniKoto } from "./episodes";
import { buildSeries } from "./series";

/**
 * Serializes writes of one entry's series, with the entry's AniList ID.
 * Stores run from requests and scheduler jobs at once, and two of one entry
 * must not replace its episodes at the same time.
 */
const storeLockKey = 0x5e71e5;

/** Episode rows per insert, well under PostgreSQL's limit of 65,535 parameters. */
const episodeInsertBatch = 1_000;

/** The Sora IDs of the stored series of the given AniList entries, by AniList ID. */
export async function storedSeriesIds(anilistIds: readonly number[]): Promise<Map<number, string>> {
	if (anilistIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			id: series.id,
			anilistId: series.anilistId,
		})
		.from(series)
		.where(inArray(series.anilistId, [...new Set(anilistIds)]));

	return new Map(rows.map((row) => [row.anilistId, row.id]));
}

/**
 * Lays out an AniList entry as a series and stores it, replacing the stored
 * layout. Returns the series' Sora ID, which the entry keeps for good.
 *
 * When each episode aired is read from AniList's airing schedule (see
 * {@link fetchEpisodeAirings}) the first time the entry is stored and while
 * it may still gain episodes; after that the stored times are kept.
 *
 * Related entries that are not stored yet, and that can be watched or are
 * yet to come out, are queued for the scheduler to store, so a franchise is
 * stored title by title. An entry that may still
 * gain episodes is handed to the airing scheduler, which lays the series
 * out again as it airs, and the entry is queued to be looked up on
 * providers.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {@link UpstreamUnavailableError} when AniList or TMDB fail.
 */
export async function storeSeries(anilistId: number): Promise<string> {
	const built = await buildSeries(anilistId);
	const isStored = (await storedSeriesIds([anilistId])).has(anilistId);
	const airings =
		!isStored || built.mayGainEpisodes
			? await fetchEpisodeAirings([anilistId])
			: new Map<string, Date>();

	const seriesId = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${storeLockKey}, ${anilistId})`);

		const values = {
			key: built.key,
			kind: built.kind,
			title: built.title,
			overview: built.overview,
			posterUrl: built.posterUrl,
			backdropUrl: built.backdropUrl,
			logoUrl: built.logoUrl,
			startDate: built.startDate,
			status: built.status,
			nextEpisodeNumber: built.nextAiring?.episode ?? null,
			nextEpisodeAiringAt: built.nextAiring ? new Date(built.nextAiring.airingAt) : null,
			laidOutAt: new Date(),
		};
		const [stored] = await tx
			.insert(series)
			.values({
				id: newId(),
				anilistId,
				...values,
			})
			.onConflictDoUpdate({
				target: series.anilistId,
				set: values,
			})
			.returning({
				id: series.id,
			});
		const id = stored!.id;

		const airedBefore = new Map(
			(
				await tx
					.select({
						number: seriesEpisode.number,
						airedAt: seriesEpisode.airedAt,
					})
					.from(seriesEpisode)
					.where(eq(seriesEpisode.seriesId, id))
			).map((row) => [row.number, row.airedAt]),
		);
		await tx.delete(seriesEpisode).where(eq(seriesEpisode.seriesId, id));
		const episodes = built.episodes.map((episode) => ({
			seriesId: id,
			number: episode.number,
			title: episode.title,
			overview: episode.overview,
			airDate: episode.airDate,
			airedAt:
				airings.get(anilistEpisodeKey(anilistId, episode.number)) ??
				airedBefore.get(episode.number) ??
				null,
			runtimeMinutes: episode.runtimeMinutes === null ? null : Math.round(episode.runtimeMinutes),
			stillUrl: episode.stillUrl,
			tmdbSeasonNumber: episode.tmdb?.seasonNumber ?? null,
			tmdbEpisodeNumber: episode.tmdb?.episodeNumber ?? null,
		}));
		for (let offset = 0; offset < episodes.length; offset += episodeInsertBatch) {
			await tx.insert(seriesEpisode).values(episodes.slice(offset, offset + episodeInsertBatch));
		}

		await tx.delete(seriesRelated).where(eq(seriesRelated.seriesId, id));
		if (built.related.length > 0) {
			await tx
				.insert(seriesRelated)
				.values(
					built.related.map((related, position) => ({
						seriesId: id,
						...related,
						position,
					})),
				)
				.onConflictDoNothing();
		}

		return id;
	});
	await storeBackdropEdges(seriesId);

	// Readers take the series' details from its anime, so it must be stored.
	await getAnime(anilistId);
	if (built.mayGainEpisodes) {
		await startTrackingAiring(anilistId);
	}

	// Episode listings read providers' episode lists from the database only.
	await scheduleEpisodeLookups([anilistId], "backfill");

	for (const id of await relatedWorthStoring(built.related.map((related) => related.anilistId))) {
		await scheduleSeriesStore(id, "backfill");
	}

	return seriesId;
}

/**
 * The entries among `anilistIds` that are not stored yet and are worth
 * storing as titles of a franchise: those AniKoto carries, which can be
 * watched, and those airing or yet to come out, which will be. Storing every
 * related entry would follow AniList's relations through specials and
 * extras nothing streams.
 */
async function relatedWorthStoring(anilistIds: readonly number[]): Promise<number[]> {
	if (anilistIds.length === 0) {
		return [];
	}

	const stored = await storedSeriesIds(anilistIds);
	const rows = await db
		.select({
			anilistId: animeSearch.anilistId,
		})
		.from(animeSearch)
		.where(
			and(
				inArray(animeSearch.anilistId, [...new Set(anilistIds)]),
				not(animeSearch.isAdult),
				sql`${animeSearch.format} is distinct from 'MUSIC'`,
				or(inArray(animeSearch.status, ["RELEASING", "NOT_YET_RELEASED"]), carriedByAniKoto),
			),
		);
	return rows.map((row) => row.anilistId).filter((anilistId) => !stored.has(anilistId));
}
