import { day, defined } from "@sora/shared";
import { and, asc, eq, gte, inArray, isNull, lte, ne, or, sql } from "drizzle-orm";
import type { z } from "zod";

import { toFormat } from "../catalog/models/anime";
import { getAnime } from "../catalog/queries/anime";
import { browse } from "../catalog/queries/browse";
import type { Page } from "../catalog/queries/browse";
import { BrowseQuerySchema } from "../catalog/queries/browse-query";
import type { BrowseQuery } from "../catalog/queries/browse-query";
import { browseIndex, searchIndex, findAnime } from "../catalog/queries/search";
import { catalogSeriesAllowed, tagMinimumRank } from "../catalog/visibility";
import { db } from "../database/client";
import { animeSearch } from "../database/schema/catalog";
import {
	anikotoSeries,
	animeScheduleRelease,
	animeScheduleShow,
	providerMapping,
	seriesSubtitles,
} from "../database/schema/playback";
import {
	imageEdge,
	series,
	titleEpisode,
	titleRelation,
	titleFacts,
	tmdbMapping,
} from "../database/schema/series";
import { UnknownEpisodeError, InvalidInputError, UnknownSeriesError } from "../errors";
import type {
	ContentLanguage,
	Episode,
	FranchisePart,
	PreparingTitle,
	Release,
	Series,
	SeriesCard,
} from "../models/series";
import { findAnimeLanguages, findListings } from "../playback/episodes/versions";
import { requestSubtitleProbe } from "../scheduler/queue";
import { About } from "./about";
import { BrowsePage } from "./browse-page";
import { Cards } from "./cards";
import { effectiveBackdrop, effectiveStill } from "./edges";
import {
	anilistKey,
	aniKotoCarries,
	expectedRelease,
	isAwaited,
	loadCarried,
	releasedAtOf,
	releasedBetween,
} from "./episodes";
import { Franchise, isNamedAfter } from "./franchise";
import { FranchiseWalk } from "./franchise-walk";
import { Listing } from "./listing";
import { ReleaseAge } from "./release-age";
import { classify } from "./roles";

type SeriesRow = typeof series.$inferSelect;

/**
 * {@link titles.listedEpisodes} with only what telling whether and when an episode
 * came out takes, for callers that count episodes or look at their dates:
 * titles' titles and overviews are the bulk of a long series' rows.
 */
export const listedDatesOf = async (entries: readonly SeriesRow[]) => {
	const [rows, onAniKoto] = await Promise.all([
		db
			.select({
				airDate: titleEpisode.airDate,
				airedAt: titleEpisode.airedAt,
				number: titleEpisode.number,
				seriesId: titleEpisode.seriesId,
				tmdbEpisodeNumber: titleEpisode.tmdbEpisodeNumber,
			})
			.from(titleEpisode)
			.where(
				inArray(
					titleEpisode.seriesId,
					entries.map((title) => title.id),
				),
			)
			.orderBy(asc(titleEpisode.number)),
		loadCarried(entries.map((title) => title.anilistId)),
	]);

	return new Listing(entries, onAniKoto).keep(rows);
};

/**
 * Builds visible cards of stored series rows, keyed by series ID, with each
 * title's audio and listed episodes. Catalogue-hidden formats are omitted unless
 * their IDs are explicitly included for a saved watchlist or selected title.
 * Reads only the database.
 */
export const toCards = async (
	rows: readonly SeriesRow[],
	includeHiddenIds: readonly string[] = [],
): Promise<Map<string, SeriesCard>> =>
	new Cards(rows, await listedDatesOf(rows), includeHiddenIds).build();

/** A stored series, as its page and episode lists show it. */
class Title {
	readonly #row: SeriesRow;

	constructor(row: SeriesRow) {
		this.#row = row;
	}

	/**
	 * A stored series' row.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	static async load(id: string) {
		const [row] = await db.select().from(series).where(eq(series.id, id)).limit(1);

		if (!row) {
			throw new UnknownSeriesError(id);
		}

		return row;
	}

	/**
	 * The stored titles of a series' franchise (see {@link FranchiseWalk}), this
	 * one included, as {@link Franchise} lists them: those with an episode
	 * to watch, and the seasons announced but yet to come out, which the page
	 * shows as coming soon. Other titles yet to come out, those still queued for
	 * storing, and music videos, are left out, though the series itself is always
	 * listed. Whether
	 * a title has come out is told by its listed episodes, not by AniList's
	 * status, which reads "not yet released" until its airing check runs, often
	 * well after the first episode can be watched.
	 */
	async franchise(): Promise<FranchisePart[]> {
		const row = this.#row;
		const { ids, crossovers, apart } = await new FranchiseWalk(row.anilistId).reach();
		const rows = await db.select().from(series).where(inArray(series.anilistId, ids));

		const entries = [
			row,
			...rows.filter(
				(other) =>
					!crossovers.has(other.anilistId) ||
					isNamedAfter(row.title, other.title) ||
					isNamedAfter(other.title, row.title),
			),
		];

		const [cards, relations, ratings] = await Promise.all([
			toCards(entries, [row.id]),
			db
				.select({
					from: series.anilistId,
					relation: titleRelation.relation,
					to: titleRelation.anilistId,
				})
				.from(titleRelation)
				.innerJoin(series, eq(series.id, titleRelation.seriesId))
				.where(
					inArray(
						titleRelation.seriesId,
						entries.map((title) => title.id),
					),
				),
			db
				.select({
					anilistId: animeSearch.anilistId,
					popularity: animeSearch.popularity,
					score: animeSearch.averageScore,
				})
				.from(animeSearch)
				.where(
					inArray(
						animeSearch.anilistId,
						entries.map((title) => title.anilistId),
					),
				),
		]);

		const isListed = (title: SeriesRow) => {
			const card = cards.get(title.id);

			return (
				title.id === row.id ||
				(card !== undefined &&
					card.format !== "MUSIC" &&
					(card.episode_count > 0 ||
						(title.status === "NOT_YET_RELEASED" &&
							card.format !== null &&
							["TV", "TV_SHORT", "ONA"].includes(card.format))))
			);
		};

		const { parts } = new Franchise(
			entries.map((title) => {
				const card = cards.get(title.id);

				return {
					anilistId: title.anilistId,
					episodeCount: card?.episode_count ?? 0,
					format: card?.format ?? null,
					seriesId: title.id,
					startDate: title.startDate,
					title: card?.title ?? title.title,
				};
			}),
			relations.flatMap(({ from, to, relation }) => {
				if (relation === "SEQUEL") {
					return [[from, to] as const];
				}

				if (relation === "PREQUEL") {
					return [[to, from] as const];
				}

				return [];
			}),
			{
				alternatives: relations
					.filter(({ relation }) => relation === "ALTERNATIVE")
					.map(({ from, to }) => [from, to] as const),
				apart: [...apart],
				crossovers: [...crossovers],
				currentId: row.anilistId,
				spinOffs: relations
					.filter(({ relation }) => relation === "SPIN_OFF")
					.map(({ from, to }) => [from, to] as const),
				summaries: relations
					.filter(({ relation }) => relation === "SUMMARY" || relation === "COMPILATION")
					.map(({ to }) => to),
				unlisted: entries
					.values()
					.filter((title) => !isListed(title))
					.map((title) => title.anilistId)
					.toArray(),
			},
		);

		const anilistIdOf = new Map(entries.map((title) => [title.id, title.anilistId]));
		const ratingOf = new Map(ratings.map((rating) => [rating.anilistId, rating]));

		const roles = classify(
			parts.flatMap((part) => {
				const anilistId = defined(anilistIdOf.get(part.series_id));

				return [
					{
						anilistId,
						durationMinutes: null,
						episodeCount: part.episode_count,
						format: part.format,
						popularity: ratingOf.get(anilistId)?.popularity ?? null,
						score: ratingOf.get(anilistId)?.score ?? null,
					},
				];
			}),
			relations.map(({ from, to, relation }) => ({
				from,
				to,
				type: relation,
			})),
			new Set(
				parts
					.filter((part) => part.role === "season" || part.role === "special")
					.map((part) => defined(anilistIdOf.get(part.series_id))),
			),
		);

		const spinOffRole = (part: (typeof parts)[number]) => {
			if (
				part.role === "extra" &&
				roles.get(defined(anilistIdOf.get(part.series_id))) === "spin_off"
			) {
				return "spin_off" as const;
			}

			return part.role;
		};

		return parts
			.filter((part) => {
				const role = roles.get(defined(anilistIdOf.get(part.series_id)));

				return part.series_id === row.id || (role !== "noise" && role !== "recap");
			})
			.map((part) => ({
				...part,
				card: defined(cards.get(part.series_id)),
				role: spinOffRole(part),
			}));
	}

	/**
	 * The first of a series' awaited episodes (see {@link isAwaited})
	 * still expected to come out, with when it is expected (see
	 * {@link expectedRelease}), or `null` when none is.
	 */
	async overdue(now = new Date()): Promise<Series["next_episode"]> {
		const row = this.#row;

		const [episodes, onAniKoto] = await Promise.all([
			db
				.select()
				.from(titleEpisode)
				.where(eq(titleEpisode.seriesId, row.id))
				.orderBy(asc(titleEpisode.number)),
			loadCarried([row.anilistId]),
		]);

		const awaited = episodes.filter((episode) => isAwaited(row, episode, onAniKoto, now));

		if (awaited.length === 0) {
			return null;
		}

		const scheduled = await db
			.select({
				airType: animeScheduleRelease.airType,
				airsAt: animeScheduleRelease.airsAt,
				episode: animeScheduleRelease.episode,
			})
			.from(animeScheduleRelease)
			.innerJoin(animeScheduleShow, eq(animeScheduleShow.route, animeScheduleRelease.route))
			.where(
				and(
					eq(animeScheduleShow.anilistId, row.anilistId),
					inArray(animeScheduleRelease.airType, ["raw", "sub"]),
				),
			);

		// A subbed stream's time counts over the broadcast's.
		const scheduledAt = new Map<number, Date>();

		for (const release of scheduled.toSorted(
			(left, right) => Number(left.airType === "sub") - Number(right.airType === "sub"),
		)) {
			scheduledAt.set(release.episode, release.airsAt);
		}

		const [first] = awaited
			.flatMap((episode) => {
				if (!episode.airedAt) {
					return [];
				}

				const expected = expectedRelease(
					episode.airedAt,
					scheduledAt.get(episode.number) ?? null,
					now,
				);

				if (expected) {
					return [
						{
							expected,
							number: episode.number,
						},
					];
				}

				return [];
			})
			.toSorted((left, right) => left.expected.getTime() - right.expected.getTime());

		if (first) {
			return {
				airing_at: first.expected.toISOString(),
				number: first.number,
			};
		}

		return null;
	}

	/**
	 * What a title's about section is made of beyond its anime: MyAnimeList's
	 * rating of the AniKoto series it streams from, its TMDB title's facts, and
	 * the subtitles its streams were seen with. A title with a sub whose
	 * subtitles were never looked at, or found none a while ago, is queued to
	 * be looked at; the page shows them the next time it is read.
	 */
	async aboutSources(audio: readonly ContentLanguage[]) {
		const row = this.#row;
		/** How long after a probe found no subtitles a series is looked at again. */
		const probeRetryMs = 7 * day;

		const [[rated], [facts], [subtitles]] = await Promise.all([
			db
				.select({
					rating: anikotoSeries.rating,
				})
				.from(providerMapping)
				.innerJoin(
					anikotoSeries,
					sql`${anikotoSeries.anikotoId}::text = ${providerMapping.providerMediaId}`,
				)
				.where(
					and(
						eq(providerMapping.anilistId, row.anilistId),
						eq(providerMapping.provider, "anikoto"),
					),
				)
				.limit(1),
			db
				.select({
					awards: titleFacts.awards,
					certification: titleFacts.certification,
					descriptors: titleFacts.descriptors,
					keywords: titleFacts.keywords,
				})
				.from(titleFacts)
				.where(eq(titleFacts.key, row.key))
				.limit(1),
			db
				.select({
					checkedAt: seriesSubtitles.checkedAt,
					languages: seriesSubtitles.languages,
				})
				.from(seriesSubtitles)
				.where(eq(seriesSubtitles.seriesId, row.id))
				.limit(1),
		]);

		const unchecked =
			!subtitles ||
			(subtitles.languages.length === 0 &&
				subtitles.checkedAt.getTime() < Date.now() - probeRetryMs);

		if (audio.includes("sub") && unchecked) {
			await requestSubtitleProbe(row.id);
		}

		const awards = facts?.awards ?? [];

		// How many stored titles each award was given to, by name, which tells
		// anime's own awards from those that once named an anime.
		const names = [...new Set(awards.map((award) => award.name))];

		const reachOf = async () => {
			if (names.length === 0) {
				return new Map<string, number>();
			}

			const rows = await db.execute<{
				name: string;
				titles: number;
			}>(sql`
    select award ->> 'name' as name, count(distinct ${titleFacts.key})::int as titles
    from ${titleFacts}, jsonb_array_elements(${titleFacts.awards}) as award
    where award ->> 'name' in ${names}
    group by 1
  `);

			return new Map(rows.map((entry) => [entry.name, entry.titles]));
		};

		const [awardReach, seasons] = await Promise.all([
			reachOf(),
			db
				.select({
					startDate: series.startDate,
				})
				.from(series)
				.innerJoin(tmdbMapping, eq(tmdbMapping.anilistId, series.anilistId))
				.where(
					and(
						eq(series.key, row.key),
						ne(series.id, row.id),
						or(isNull(tmdbMapping.seasonNumber), ne(tmdbMapping.seasonNumber, 0)),
					),
				),
		]);

		return {
			ageRating: rated?.rating ?? null,
			awardReach,
			awards,
			certification: facts?.certification ?? null,
			descriptors: facts?.descriptors ?? [],
			keywords: facts?.keywords ?? [],
			seasonStarts: seasons.flatMap((season) => Number(season.startDate?.slice(0, 4)) || []),
			subtitles: subtitles?.languages ?? [],
		};
	}

	/** `episodes` as listed: with their stills, audio, and whether each is filler. */
	async describe(episodes: (typeof titleEpisode.$inferSelect)[]): Promise<Episode[]> {
		const row = this.#row;
		const first = episodes.at(0);
		const last = episodes.at(-1);

		const stillsOf = async () => {
			if (!first || !last) {
				return [];
			}

			return await db
				.select({
					number: titleEpisode.number,
					stillUrl: effectiveStill,
				})
				.from(titleEpisode)
				.innerJoin(series, eq(series.id, titleEpisode.seriesId))
				.where(
					and(
						eq(titleEpisode.seriesId, row.id),
						gte(titleEpisode.number, first.number),
						lte(titleEpisode.number, last.number),
					),
				);
		};

		const [stills, listings] = await Promise.all([
			stillsOf(),
			findListings(
				episodes.map((episode) => ({
					anilistId: row.anilistId,
					episode: episode.number,
				})),
			),
		]);

		const stillOf = new Map(stills.map((still) => [still.number, still.stillUrl]));

		return episodes.map((episode) => {
			const listing = listings.get(anilistKey(row.anilistId, episode.number));

			return {
				air_date: episode.airDate,
				aired_at: episode.airedAt?.toISOString() ?? null,
				audio: listing?.languages ?? null,
				filler: listing?.isFiller ?? false,
				number: episode.number,
				overview: episode.overview,
				runtime_minutes: episode.runtimeMinutes,
				still_url: stillOf.get(episode.number) ?? null,
				title: episode.title,
			};
		});
	}
}

/** Stored series in release order, the earliest first; those undated last. */
export const byStartDate = (rows: readonly SeriesRow[]) =>
	rows.toSorted(
		(left, right) =>
			(left.startDate ?? "9999").localeCompare(right.startDate ?? "9999") ||
			left.anilistId - right.anilistId,
	);

/** Filters and paging for {@link titles.latestReleases}. Validate untrusted input with this schema. */
export const ReleasesQuerySchema = BrowseQuerySchema.pick({
	audio: true,
	format: true,
	page: true,
	perPage: true,
});

export type ReleasesQuery = z.input<typeof ReleasesQuerySchema>;

export const titles = {
	/**
	 * The episodes before and after one, for moving through a title in order.
	 *
	 * Only the episodes the title lists count (see {@link isAvailable}), so
	 * `next` is never an episode AniKoto does not carry yet. Each is `null` at
	 * either end: playing never runs on into another title, such as the next
	 * season.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async adjacentEpisodes(
		id: string,
		episode: number,
	): Promise<{
		previous: number | null;
		next: number | null;
	}> {
		const row = await Title.load(id);
		const listedByRow = await listedDatesOf([row]);
		const listed = listedByRow.get(row.id) ?? [];
		const numbers = listed.map((entry) => entry.number);

		return {
			next: numbers.find((candidate) => candidate > episode) ?? null,
			previous: numbers.findLast((candidate) => candidate < episode) ?? null,
		};
	},

	/**
	 * Checks that a series is stored, for operations that take a series ID but
	 * do not read the series itself.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async assertExists(id: string) {
		const [stored] = await db
			.select({
				id: series.id,
			})
			.from(series)
			.where(eq(series.id, id))
			.limit(1);

		if (!stored) {
			throw new UnknownSeriesError(id);
		}
	},

	/**
	 * Searches and filters the catalog, returning one card per AniList entry:
	 * a show's seasons, films, and OVAs are each a title of their own.
	 *
	 * Both are answered from the local search index, AniList's catalogue
	 * mirrored, so they never wait on AniList or its rate limit. A text search
	 * is ranked by how well titles match and how popular they are (see
	 * {@link findAnime}). Browsing without one orders the entries by `sort`
	 * and lists only those AniKoto carries, since only they can be watched (see
	 * {@link browseIndex}). Until the index has been filled once, browsing
	 * follows AniList's page of entries instead, and only the filters AniList
	 * applies itself work there: tags, studios, sources, countries, years,
	 * episode counts, scores, and hiding mature content wait for the index.
	 *
	 * Reads only stored titles, so a search never waits on AniList or TMDB. An
	 * entry that is not stored yet is queued for the scheduler and left out of
	 * `items` until it is, with `isPreparing` set so the client can ask again.
	 * Those on the page are listed in `preparing`, with what the search index
	 * knows of them and where they are expected, so a client can show them at
	 * once rather than a page that comes back short.
	 *
	 * @throws {InvalidInputError} when the query fails `BrowseQuerySchema`.
	 * @throws {UpstreamUnavailableError} when AniList cannot be browsed
	 *   before the index is filled.
	 */
	async browse(query: BrowseQuery): Promise<
		Page<SeriesCard> & {
			preparing: PreparingTitle[];
		}
	> {
		const parsed = BrowseQuerySchema.safeParse(query);

		if (!parsed.success) {
			throw new InvalidInputError("Invalid browse query", {
				cause: parsed.error,
			});
		}

		const { search, page, perPage, audio, ...filters } = parsed.data;

		/** Cards for stored series, in the given order, of those with the audio asked for. */
		const cardsOf = async (ids: readonly string[]) => {
			const rows = await db
				.select()
				.from(series)
				.where(inArray(series.id, [...ids]));

			const cards = await toCards(rows);
			const ordered = ids.flatMap((id) => cards.get(id) ?? []);

			if (audio) {
				return ordered.filter((card) => card.audio.includes(audio));
			}

			return ordered;
		};

		if (await searchIndex.complete()) {
			// One entry more than the page holds tells whether another page follows.
			let found: (typeof animeSearch.$inferSelect)[] = [];

			if (search === undefined) {
				found = await browseIndex(filters, page * perPage + 1, aniKotoCarries);
			}

			if (search !== undefined) {
				found = await findAnime(search, filters);
			}

			const ranked = found.map((entry) => entry.anilistId);
			const pageStart = (page - 1) * perPage;

			const { seriesIds, missing } = await new BrowsePage({
				pageStart,
				perPage,
				wanted: page * perPage + 1,
			}).stored(ranked);

			const ordered = ranked.flatMap((anilistId) => seriesIds.get(anilistId) ?? []);
			const indexed = new Map(found.map((entry) => [entry.anilistId, entry]));
			const items = await cardsOf(ordered.slice(pageStart, page * perPage));
			let preparing: PreparingTitle[] = [];

			if (!audio) {
				preparing = BrowsePage.preparing(missing, pageStart, perPage, (anilistId) => {
					const entry = indexed.get(anilistId);

					if (!entry) {
						return entry;
					}

					let year = entry.seasonYear;

					if (year === null && entry.startDate) {
						year = Number(entry.startDate.slice(0, 4));
					}

					return {
						format: toFormat(entry.format),
						title: entry.english ?? entry.romaji ?? entry.native,
						year,
					};
				});
			}

			return {
				hasNextPage: ordered.length > page * perPage,
				isPreparing: missing.length > 0,
				items,
				page,
				perPage,
				preparing,
			};
		}

		const found = await browse(parsed.data);
		const anilistIds = found.items.map((anime) => anime.id);

		const { seriesIds, missing } = await new BrowsePage({
			pageStart: 0,
			perPage: found.perPage,
			wanted: Number.POSITIVE_INFINITY,
		}).stored(anilistIds);

		const cards = new Map(found.items.map((anime) => [anime.id, anime]));
		const items = await cardsOf(anilistIds.flatMap((anilistId) => seriesIds.get(anilistId) ?? []));
		let preparing: PreparingTitle[] = [];

		if (!audio) {
			preparing = BrowsePage.preparing(missing, 0, Number.POSITIVE_INFINITY, (anilistId) => {
				const anime = cards.get(anilistId);

				if (!anime) {
					return anime;
				}

				return {
					format: anime.format,
					title: anime.title.display,
					year: anime.seasonYear,
				};
			});
		}

		return {
			hasNextPage: found.hasNextPage,
			isPreparing: missing.length > 0,
			items,
			page: found.page,
			perPage: found.perPage,
			preparing,
		};
	},

	/**
	 * One episode of a series, as {@link titles.episodes} lists it.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 * @throws {UnknownEpisodeError} when the series does not list the episode.
	 */
	async episode(id: string, number: number): Promise<Episode> {
		const episodes = await titles.episodes(id);
		const episode = episodes.find((candidate) => candidate.number === number);

		if (!episode) {
			throw new UnknownEpisodeError(id, number);
		}

		return episode;
	},

	/**
	 * A slice of {@link titles.episodes}: `limit` episodes after skipping
	 * `offset`, and how many episodes the title lists in all. Only the slice's
	 * episodes are looked up for their audio and fillers.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async episodePage(
		id: string,
		window: {
			offset: number;
			limit: number;
		},
	): Promise<{
		episodes: Episode[];
		total: number;
	}> {
		const row = await Title.load(id);
		const listedByRow = await titles.listedEpisodes([row]);
		const listed = listedByRow.get(id) ?? [];

		return {
			episodes: await new Title(row).describe(
				listed.slice(window.offset, window.offset + window.limit),
			),
			total: listed.length,
		};
	},

	/**
	 * Lists a title's episodes, numbered from 1, with the audio each can be
	 * watched in and whether each is filler.
	 *
	 * AniKoto decides which episodes exist: an episode is listed once AniKoto
	 * carries it, as {@link isAvailable} lays out.
	 *
	 * Both come from providers' stored episode lists, so a listing reads only
	 * the database. An anime no provider has been looked up for yet is queued
	 * for the scheduler, and its episodes' audio is `null` until it has run;
	 * the scheduler keeps the lists current as the anime airs.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async episodes(id: string): Promise<Episode[]> {
		const row = await Title.load(id);
		const listed = await titles.listedEpisodes([row]);

		return new Title(row).describe(listed.get(id) ?? []);
	},

	/**
	 * Loads a title's page: its details and the other titles of its franchise.
	 *
	 * Reads only the database: titles are laid out when first found, and the
	 * scheduler keeps them current.
	 *
	 * @throws {UnknownSeriesError} when the ID does not identify a series.
	 */
	async get(id: string): Promise<Series> {
		const [found] = await db
			.select({
				edges: {
					left: imageEdge.left,
					right: imageEdge.right,
				},
				series,
			})
			.from(series)
			.leftJoin(imageEdge, eq(imageEdge.url, effectiveBackdrop))
			.where(eq(series.id, id))
			.limit(1);

		if (!found) {
			throw new UnknownSeriesError(id);
		}

		const row = found.series;
		const title = new Title(row);

		const [anime, cards, franchise, overdue, [indexed]] = await Promise.all([
			getAnime(row.anilistId),
			toCards([row], [row.id]),
			title.franchise(),
			title.overdue(),
			db
				.select({
					scoreCount: animeSearch.scoreCount,
					scoreStars: animeSearch.scoreStars,
				})
				.from(animeSearch)
				.where(eq(animeSearch.anilistId, row.anilistId))
				.limit(1),
		]);

		const card = defined(cards.get(row.id));
		const about = await title.aboutSources(card.audio);
		const current = franchise.find((part) => part.series_id === row.id);
		const seasons = franchise.filter((part) => part.role === "season");

		let announced: Series["next_episode"] = null;

		const airingAt = row.nextEpisodeAiringAt;
		const number = row.nextEpisodeNumber;

		const isAhead = airingAt !== null && airingAt > new Date();

		if (isAhead && number !== null) {
			announced = {
				airing_at: airingAt.toISOString(),
				number,
			};
		}

		let shownSeasons = seasons;

		if (current && current.role !== "season") {
			shownSeasons = [current, ...seasons];
		}

		return {
			...card,
			...new About({
				...about,
				anime,
				audio: card.audio,
				overview: card.overview,
			}).section,
			backdrop_edges: found.edges,
			genres: anime.genres,
			// An aired episode still to come out is next until it is listed, ahead of
			// the one AniList announces after it.
			next_episode: overdue ?? announced,
			related: [
				...franchise.filter((part) => part.role === "spin_off"),
				...franchise.filter((part) => part.role === "extra"),
			],
			score_count: indexed?.scoreCount ?? null,
			score_stars: indexed?.scoreStars ?? null,
			seasons: shownSeasons,
			specials: franchise.filter((part) => part.role === "special"),
			start_date: row.startDate,
			studios: anime.studios,
			tags: anime.tags
				.filter((tag) => (tag.rank ?? 0) >= tagMinimumRank)
				.toSorted((left, right) => (right.rank ?? 0) - (left.rank ?? 0)),
		};
	},

	/**
	 * The titles with an episode out in the last 30 days, each with its latest
	 * episode that can be watched, the latest first.
	 *
	 * An episode counts once its title lists it (see {@link isAvailable}),
	 * so an episode that has aired but that AniKoto does not carry yet is left
	 * out until it does. `format` and `audio` apply to the title's AniList
	 * entry. Reads only the database.
	 *
	 * @throws {InvalidInputError} when the query fails {@link ReleasesQuerySchema}.
	 */
	async latestReleases(query: ReleasesQuery, now = new Date()): Promise<Page<Release>> {
		/** How far back {@link titles.latestReleases} looks. */
		const releaseWindowMs = 30 * day;

		const parsed = ReleasesQuerySchema.safeParse(query);

		if (!parsed.success) {
			throw new InvalidInputError("Invalid releases query", {
				cause: parsed.error,
			});
		}

		const { format, audio, page, perPage } = parsed.data;
		const since = new Date(now.getTime() - releaseWindowMs);

		const rows = await db
			.select()
			.from(series)
			.where(
				and(
					catalogSeriesAllowed,
					inArray(
						series.id,
						db
							.selectDistinct({
								seriesId: titleEpisode.seriesId,
							})
							.from(titleEpisode)
							.where(releasedBetween(since, now)),
					),
				),
			);

		const listed = await listedDatesOf(rows);

		const latest = rows.flatMap((row) => {
			let found:
				| {
						seriesId: string;
						anilistId: number;
						episode: number;
						releasedAt: string;
				  }
				| undefined;

			for (const episode of listed.get(row.id) ?? []) {
				const at = releasedAtOf(episode);

				const newer =
					at !== null &&
					at >= since &&
					at <= now &&
					(!found || at.toISOString() >= found.releasedAt);

				if (newer) {
					found = {
						anilistId: row.anilistId,
						episode: episode.number,
						releasedAt: at.toISOString(),
						seriesId: row.id,
					};
				}
			}

			if (found) {
				return [found];
			}

			return [];
		});

		const anilistIds = latest.map((release) => release.anilistId);

		const formatsOf = async () => {
			if (!format) {
				return [];
			}

			return await db
				.select({
					anilistId: animeSearch.anilistId,
					format: animeSearch.format,
				})
				.from(animeSearch)
				.where(inArray(animeSearch.anilistId, anilistIds));
		};

		const languagesOf = async () => {
			if (!audio) {
				return new Map<number, ContentLanguage[]>();
			}

			return await findAnimeLanguages(anilistIds);
		};

		const [formats, languages] = await Promise.all([formatsOf(), languagesOf()]);

		const formatOf = new Map(formats.map((row) => [row.anilistId, row.format]));

		const matching = latest
			.filter(
				(release) =>
					(!format || format.some((wanted) => wanted === formatOf.get(release.anilistId))) &&
					(!audio || !!languages.get(release.anilistId)?.includes(audio)),
			)
			.toSorted(
				(left, right) =>
					right.releasedAt.localeCompare(left.releasedAt) ||
					left.seriesId.localeCompare(right.seriesId),
			);

		const shown = matching.slice((page - 1) * perPage, page * perPage);
		const shownIds = new Set(shown.map((release) => release.seriesId));

		const cards = await new Cards(
			rows.filter((row) => shownIds.has(row.id)),
			listed,
		).build();

		return {
			hasNextPage: matching.length > page * perPage,
			isPreparing: false,
			items: shown.flatMap(({ seriesId, episode, releasedAt }) => {
				const card = cards.get(seriesId);

				if (card) {
					return [
						{
							episode,
							released_at: releasedAt,
							series: card,
							...new ReleaseAge(releasedAt, now.getTime()).fields,
						},
					];
				}

				return [];
			}),
			page,
			perPage,
		};
	},

	/** The episodes each title lists, of several series at once, keyed by series ID. */
	async listedEpisodes(entries: readonly SeriesRow[]) {
		const [rows, onAniKoto] = await Promise.all([
			db
				.select()
				.from(titleEpisode)
				.where(
					inArray(
						titleEpisode.seriesId,
						entries.map((title) => title.id),
					),
				)
				.orderBy(asc(titleEpisode.number)),
			loadCarried(entries.map((title) => title.anilistId)),
		]);

		return new Listing(entries, onAniKoto).keep(rows);
	},
};
