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
import { measureBackdrop } from "./edges";
import { anilistEpisodeKey, carriedByAniKoto } from "./episodes";
import { layOut } from "./series";

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
	/** Episode rows per insert, well under PostgreSQL's limit of 65,535 parameters. */
	const episodeInsertBatch = 1000;

	/**
	 * Serializes writes of one entry's series, with the entry's AniList ID.
	 * Stores run from requests and scheduler jobs at once, and two of one entry
	 * must not replace its episodes at the same time.
	 */
	const lockKey = 0x5e_71_e5;

	const built = await layOut(anilistId);
	const storedIds = await storedSeriesIds([anilistId]);
	const isStored = storedIds.has(anilistId);

	const readsAirings = built.useAniListAirings && (!isStored || built.mayGainEpisodes);
	let airings = new Map<string, Date>();

	if (readsAirings) {
		airings = await fetchEpisodeAirings([anilistId]);
	}

	const storedId = await db.transaction(async (tx) => {
		await tx.execute(sql`select pg_advisory_xact_lock(${lockKey}, ${anilistId})`);

		let nextAiringAt: Date | null = null;

		if (built.nextAiring) {
			nextAiringAt = new Date(built.nextAiring.airingAt);
		}

		const values = {
			backdropUrl: built.backdropUrl,
			key: built.key,
			kind: built.kind,
			laidOutAt: new Date(),
			logoUrl: built.logoUrl,
			nextEpisodeAiringAt: nextAiringAt,
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

		const episodes = built.episodes.map((episode) => {
			let airedAt: Date | null = null;

			if (built.useAniListAirings) {
				airedAt =
					airings.get(anilistEpisodeKey(anilistId, episode.number)) ??
					airedBefore.get(episode.number) ??
					null;
			}

			let runtimeMinutes: number | null = null;

			if (episode.runtimeMinutes !== null) {
				runtimeMinutes = Math.round(episode.runtimeMinutes);
			}

			return {
				airDate: episode.airDate,
				airedAt,
				number: episode.number,
				overview: episode.overview,
				runtimeMinutes,
				seriesId: id,
				stillUrl: episode.stillUrl,
				title: episode.title,
				tmdbEpisodeNumber: episode.tmdb?.episodeNumber ?? null,
				tmdbSeasonNumber: episode.tmdb?.seasonNumber ?? null,
			};
		});

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

	await measureBackdrop(storedId);

	// Readers take the series' details from its anime, so it must be stored.
	await getAnime(anilistId);

	if (built.mayGainEpisodes) {
		await startTrackingAiring(anilistId);
	}

	// Episode listings read providers' episode lists from the database only.
	await scheduleEpisodeLookups([anilistId], "backfill");

	// The related entries that are not stored yet and are worth storing as
	// titles of the franchise: those AniKoto carries, which can be watched,
	// and those airing or yet to come out, which will be. Storing every
	// related entry would follow AniList's relations through specials and
	// extras nothing streams.
	const relatedIds = built.related.map((related) => related.anilistId);

	if (relatedIds.length === 0) {
		return storedId;
	}

	const known = await storedSeriesIds(relatedIds);

	const rows = await db
		.select({
			anilistId: animeSearch.anilistId,
		})
		.from(animeSearch)
		.where(
			and(
				inArray(animeSearch.anilistId, [...new Set(relatedIds)]),
				not(animeSearch.isAdult),
				sql`${animeSearch.format} is distinct from 'MUSIC'`,
				or(inArray(animeSearch.status, ["RELEASING", "NOT_YET_RELEASED"]), carriedByAniKoto),
			),
		);

	const worthStoring = rows.map((row) => row.anilistId).filter((related) => !known.has(related));

	await inSequence(worthStoring, (id) => scheduleSeriesStore(id, "backfill"));

	return storedId;
};
