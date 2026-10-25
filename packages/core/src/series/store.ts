import { defined, inSequence, chunked } from "@sora/shared";
import { and, eq, inArray, not, or, sql } from "drizzle-orm";

import { getAnime } from "../catalog/queries/anime";
import { fetchEpisodeAirings } from "../catalog/queries/schedule";
import { db } from "../database/client";
import { animeSearch } from "../database/schema/catalog";
import { series, seriesEpisode, seriesRelated } from "../database/schema/series";
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
const storeLockKey = 0x5e_71_e5;

/** Episode rows per insert, well under PostgreSQL's limit of 65,535 parameters. */
const episodeInsertBatch = 1000;

/** The Sora IDs of the stored series of the given AniList entries, by AniList ID. */
export const storedSeriesIds = async (
	anilistIds: readonly number[],
): Promise<Map<number, string>> => {
	if (anilistIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.select({
			anilistId: series.anilistId,
			id: series.id,
		})
		.from(series)
		.where(inArray(series.anilistId, [...new Set(anilistIds)]));

	return new Map(rows.map((row) => [row.anilistId, row.id]));
};

/**
 * The entries among `anilistIds` that are not stored yet and are worth
 * storing as titles of a franchise: those AniKoto carries, which can be
 * watched, and those airing or yet to come out, which will be. Storing every
 * related entry would follow AniList's relations through specials and
 * extras nothing streams.
 */
const relatedWorthStoring = async (anilistIds: readonly number[]): Promise<number[]> => {
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
};

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
 * @throws {AnimeNotFoundError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {UpstreamUnavailableError} when AniList or TMDB fail.
 */
export const storeSeries = async (anilistId: number): Promise<string> => {
	const built = await buildSeries(anilistId);
	const storedIds = await storedSeriesIds([anilistId]);
	const isStored = storedIds.has(anilistId);
	const airings =
		built.useAniListAirings && (!isStored || built.mayGainEpisodes)
			? await fetchEpisodeAirings([anilistId])
			: new Map<string, Date>();

	const seriesId = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${storeLockKey}, ${anilistId})`);

		const values = {
			backdropUrl: built.backdropUrl,
			key: built.key,
			kind: built.kind,
			laidOutAt: new Date(),
			logoUrl: built.logoUrl,
			nextEpisodeAiringAt: built.nextAiring ? new Date(built.nextAiring.airingAt) : null,
			nextEpisodeNumber: built.nextAiring?.episode ?? null,
			overview: built.overview,
			posterUrl: built.posterUrl,
			startDate: built.startDate,
			status: built.status,
			title: built.title,
		};
		const [stored] = await tx
			.insert(series)
			.values({
				anilistId,
				id: newId(),
				...values,
			})
			.onConflictDoUpdate({
				set: values,
				target: series.anilistId,
			})
			.returning({
				id: series.id,
			});
		const { id } = defined(stored);

		const earlierEpisodes = await tx
			.select({
				airedAt: seriesEpisode.airedAt,
				number: seriesEpisode.number,
			})
			.from(seriesEpisode)
			.where(eq(seriesEpisode.seriesId, id));
		const airedBefore = new Map(earlierEpisodes.map((row) => [row.number, row.airedAt]));
		await tx.delete(seriesEpisode).where(eq(seriesEpisode.seriesId, id));
		const episodes = built.episodes.map((episode) => ({
			airDate: episode.airDate,
			airedAt: built.useAniListAirings
				? (airings.get(anilistEpisodeKey(anilistId, episode.number)) ??
					airedBefore.get(episode.number) ??
					null)
				: null,
			number: episode.number,
			overview: episode.overview,
			runtimeMinutes: episode.runtimeMinutes === null ? null : Math.round(episode.runtimeMinutes),
			seriesId: id,
			stillUrl: episode.stillUrl,
			title: episode.title,
			tmdbEpisodeNumber: episode.tmdb?.episodeNumber ?? null,
			tmdbSeasonNumber: episode.tmdb?.seasonNumber ?? null,
		}));
		await inSequence(chunked(episodes, episodeInsertBatch), async (batch) => {
			await tx.insert(seriesEpisode).values(batch);
		});

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

	const relatedIds = await relatedWorthStoring(built.related.map((related) => related.anilistId));
	await inSequence(relatedIds, (id) => scheduleSeriesStore(id, "backfill"));

	return seriesId;
};
