import { defined, chunked, sequence } from "@sora/shared";
import { and, eq, inArray, not, or, sql } from "drizzle-orm";

import { catalog } from "../catalog/queries/anime";
import { fetchEpisodeAirings } from "../catalog/queries/schedule";
import { db } from "../database/client";
import { animeSearch } from "../database/schema/catalog";
import { episodeStill, series, titleEpisode, titleRelation } from "../database/schema/series";
import { ids } from "../ids";
import {
	scheduleEpisodeLookups,
	scheduleSeriesStore,
	startTrackingAiring,
} from "../scheduler/queue";
import { imageUrl } from "../tmdb/resources";
import { edges } from "./edges";
import { episodeDetails } from "./episode-details";
import { anilistKey, aniKotoCarries } from "./episodes";
import { layOut, parseKey } from "./series";

export const store = {
	/** The Sora IDs of the stored series of the given AniList entries, by AniList ID. */
	async ids(anilistIds: readonly number[]): Promise<Map<number, string>> {
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
	},

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
	 * @throws {UnknownAnimeError} when the ID is unknown to AniList or
	 *   belongs to adult media.
	 * @throws {UpstreamUnavailableError} when AniList or TMDB fail.
	 */
	async save(anilistId: number): Promise<string> {
		/** Episode rows per insert, well under PostgreSQL's limit of 65,535 parameters. */
		const episodeInsertBatch = 1000;

		/**
		 * Serializes writes of one entry's series, with the entry's AniList ID.
		 * Stores run from requests and scheduler jobs at once, and two of one entry
		 * must not replace its episodes at the same time.
		 */
		const lockKey = 0x5e_71_e5;

		const built = await layOut(anilistId);
		const [kind, tmdbId] = parseKey(built.key);
		const storedIds = await store.ids([anilistId]);
		const isStored = storedIds.has(anilistId);

		const readsAirings = built.useAniListAirings && (!isStored || built.mayGainEpisodes);
		let airings = new Map<string, Date>();

		if (readsAirings) {
			airings = await fetchEpisodeAirings([anilistId]);
		}

		const storedId = await db.transaction(async (tx) => {
			await tx.execute(sql`select pg_advisory_xact_lock(${lockKey}, ${anilistId})`);

			const earlierEpisodes = await tx
				.select({
					chosenEpisode: episodeStill.episodeNumber,
					chosenPath: episodeStill.path,
					episode: titleEpisode,
					key: series.key,
				})
				.from(titleEpisode)
				.innerJoin(series, eq(series.id, titleEpisode.seriesId))
				.leftJoin(
					episodeStill,
					and(
						eq(episodeStill.showId, tmdbId),
						eq(episodeStill.seasonNumber, titleEpisode.tmdbSeasonNumber),
						eq(episodeStill.episodeNumber, titleEpisode.tmdbEpisodeNumber),
					),
				)
				.where(eq(series.anilistId, anilistId))
				.for("update", { of: titleEpisode });

			const airedBefore = new Map(
				earlierEpisodes.map(({ episode }) => [episode.number, episode.airedAt]),
			);

			const matchedBefore = new Map<string, (typeof earlierEpisodes)[number]>();

			for (const earlier of earlierEpisodes) {
				const { tmdbSeasonNumber, tmdbEpisodeNumber } = earlier.episode;
				const sameShow = kind === "tv" && earlier.key === built.key;
				const matched = sameShow && tmdbSeasonNumber !== null && tmdbEpisodeNumber !== null;

				if (matched) {
					matchedBefore.set(`${tmdbSeasonNumber}:${tmdbEpisodeNumber}`, earlier);
				}
			}

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
					id: ids.create(),
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

			await tx.delete(titleEpisode).where(eq(titleEpisode.seriesId, id));

			const episodes = built.episodes.map((episode) => {
				let airedAt: Date | null = null;

				if (built.useAniListAirings) {
					airedAt =
						airings.get(anilistKey(anilistId, episode.number)) ??
						airedBefore.get(episode.number) ??
						null;
				}

				let runtimeMinutes: number | null = null;

				if (episode.runtimeMinutes !== null) {
					runtimeMinutes = Math.round(episode.runtimeMinutes);
				}

				const incoming = {
					airDate: episode.airDate,
					overview: episode.overview,
					runtimeMinutes,
					stillUrl: episode.stillUrl,
					title: episode.title,
				};

				let details: ReturnType<typeof episodeDetails> = incoming;

				const earlier =
					episode.tmdb &&
					matchedBefore.get(`${episode.tmdb.seasonNumber}:${episode.tmdb.episodeNumber}`);

				if (earlier) {
					let stillUrl: string | null | undefined = episode.stillUrl ?? undefined;

					if (earlier.chosenEpisode !== null) {
						stillUrl = imageUrl(earlier.chosenPath, "original");
					}

					details = episodeDetails(
						{
							...incoming,
							stillUrl,
						},
						earlier.episode,
					);
				}

				return {
					...details,
					airedAt,
					number: episode.number,
					seriesId: id,
					tmdbEpisodeNumber: episode.tmdb?.episodeNumber ?? null,
					tmdbSeasonNumber: episode.tmdb?.seasonNumber ?? null,
				};
			});

			await sequence.all(chunked(episodes, episodeInsertBatch), async (batch) => {
				await tx.insert(titleEpisode).values(batch);
			});

			await tx.delete(titleRelation).where(eq(titleRelation.seriesId, id));

			if (built.related.length > 0) {
				await tx
					.insert(titleRelation)
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

		await edges.measureBackdrop(storedId);

		// Readers take the series' details from its anime, so it must be stored.
		await catalog.anime(anilistId);

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

		const known = await store.ids(relatedIds);

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
					or(inArray(animeSearch.status, ["RELEASING", "NOT_YET_RELEASED"]), aniKotoCarries),
				),
			);

		const worthStoring = rows.map((row) => row.anilistId).filter((related) => !known.has(related));

		await sequence.all(worthStoring, (id) => scheduleSeriesStore(id, "backfill"));

		return storedId;
	},
};
