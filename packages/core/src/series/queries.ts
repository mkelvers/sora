import { and, asc, eq, gte, inArray, isNotNull, lte, ne, notInArray, sql } from "drizzle-orm";
import type { z } from "zod";

import { toAnime, toAnimeFormat } from "../catalog/models/anime";
import { getAnime } from "../catalog/queries/anime";
import {
	browseAnime,
	BrowseQuerySchema,
	type BrowseQuery,
	type Page,
} from "../catalog/queries/browse";
import { browseIndex, hasSearchIndex, searchAnime } from "../catalog/queries/search";
import { db } from "../database/client";
import {
	anime as animeTable,
	anikotoSeries,
	animeScheduleRelease,
	animeScheduleShow,
	animeSearch,
	imageEdge,
	noArtwork,
	providerMapping,
	series,
	seriesEntry,
	seriesEpisode,
	seriesRelated,
	seriesSeason,
} from "../database/schema";
import { InvalidInputError, SeasonNotFoundError, SeriesNotFoundError } from "../errors";
import { findAnimeLanguages, findEpisodeListings } from "../playback/episodes/versions";
import { aniKoto } from "../playback/providers/registry";
import { scheduleSeriesStore } from "../scheduler/queue";
import { day } from "../time";
import { effectiveBackdrop, effectiveStill } from "./edges";
import {
	anilistEpisodeKey,
	expectedRelease,
	isEpisodeAwaited,
	isEpisodeShown,
	loadAniKotoEpisodes,
} from "./episodes";
import type {
	ContentLanguage,
	PreparingTitle,
	Release,
	Season,
	SeasonEpisode,
	Series,
	SeriesCard,
} from "./models";
import type { SeasonKind } from "./seasons";
import { storedSeriesIds } from "./store";

/**
 * Loads a title's page: its details, seasons, and related titles.
 *
 * Reads only the database: titles are laid out when first found, and the
 * scheduler keeps them current.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getSeries(seriesId: string): Promise<Series> {
	const [found] = await db
		.select({
			series,
			edges: {
				left: imageEdge.left,
				right: imageEdge.right,
			},
		})
		.from(series)
		.leftJoin(imageEdge, eq(imageEdge.url, effectiveBackdrop))
		.where(eq(series.id, seriesId))
		.limit(1);
	if (!found) {
		throw new SeriesNotFoundError(seriesId);
	}

	const row = found.series;

	const [anchor, listed, related, [indexed]] = await Promise.all([
		getAnime(row.anchorAnilistId),
		listedSeasonsOf([row]),
		relatedOf(row.id),
		db
			.select({
				scoreCount: animeSearch.scoreCount,
			})
			.from(animeSearch)
			.where(eq(animeSearch.anilistId, row.anchorAnilistId))
			.limit(1),
	]);
	const cards = await cardsFrom([row], listed);

	const isNextEpisodeAhead =
		row.nextEpisodeAiringAt !== null && row.nextEpisodeAiringAt > new Date();
	const overdue = await overdueEpisode(
		(listed.get(row.id) ?? []).flatMap((season) => season.awaited),
	);
	return {
		...cards.get(row.id)!,
		startDate: row.startDate,
		genres: anchor.genres,
		tags: anchor.tags,
		studios: anchor.studios,
		scoreCount: indexed?.scoreCount ?? null,
		// An aired episode still to come out is next until it is listed, ahead of
		// the one AniList announces after it.
		nextEpisode:
			overdue ??
			(isNextEpisodeAhead &&
			row.nextEpisodeSeasonId !== null &&
			row.nextEpisodeNumber !== null &&
			row.nextEpisodeAiringAt
				? {
						seasonId: row.nextEpisodeSeasonId,
						number: row.nextEpisodeNumber,
						airingAt: row.nextEpisodeAiringAt.toISOString(),
					}
				: null),
		backdropEdges: found.edges,
		seasons: listedOnly(listed.get(row.id)),
		related,
	};
}

/**
 * The first of the awaited episodes (see {@link isEpisodeAwaited}) still
 * expected to come out, with when it is expected (see
 * {@link expectedRelease}), or `null` when none is.
 */
async function overdueEpisode(
	awaited: readonly (typeof seriesEpisode.$inferSelect)[],
	now = new Date(),
): Promise<Series["nextEpisode"]> {
	if (awaited.length === 0) {
		return null;
	}

	const scheduled = await db
		.select({
			anilistId: animeScheduleShow.anilistId,
			episode: animeScheduleRelease.episode,
			airType: animeScheduleRelease.airType,
			airsAt: animeScheduleRelease.airsAt,
		})
		.from(animeScheduleRelease)
		.innerJoin(animeScheduleShow, eq(animeScheduleShow.route, animeScheduleRelease.route))
		.where(
			and(
				inArray(animeScheduleShow.anilistId, [
					...new Set(awaited.flatMap((row) => row.anilistId ?? [])),
				]),
				inArray(animeScheduleRelease.airType, ["raw", "sub"]),
			),
		);
	// A subbed stream's time counts over the broadcast's.
	const scheduledAt = new Map<string, Date>();
	for (const release of scheduled.toSorted(
		(left, right) => Number(left.airType === "sub") - Number(right.airType === "sub"),
	)) {
		if (release.anilistId !== null) {
			scheduledAt.set(anilistEpisodeKey(release.anilistId, release.episode), release.airsAt);
		}
	}

	const [first] = awaited
		.flatMap((row) => {
			const expected =
				row.anilistId !== null && row.anilistEpisode !== null && row.airedAt
					? expectedRelease(
							row.airedAt,
							scheduledAt.get(anilistEpisodeKey(row.anilistId, row.anilistEpisode)) ?? null,
							now,
						)
					: null;
			return expected
				? [
						{
							seasonId: row.seasonId,
							number: row.number,
							expected,
						},
					]
				: [];
		})
		.toSorted((left, right) => left.expected.getTime() - right.expected.getTime());

	return first
		? {
				seasonId: first.seasonId,
				number: first.number,
				airingAt: first.expected.toISOString(),
			}
		: null;
}

/**
 * Checks that a series is stored, for operations that take a series ID but
 * do not read the series itself.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function assertSeriesExists(seriesId: string) {
	const [stored] = await db
		.select({
			id: series.id,
		})
		.from(series)
		.where(eq(series.id, seriesId))
		.limit(1);
	if (!stored) {
		throw new SeriesNotFoundError(seriesId);
	}
}

/**
 * Loads one season of a series.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to the series.
 */
export async function getSeason(seriesId: string, seasonId: string): Promise<Season> {
	const [listed] = await listedSeasons(seriesId, seasonId);
	if (!listed) {
		throw new SeasonNotFoundError(seasonId);
	}

	return listed.season;
}

/**
 * Finds the series a season belongs to, for routes that address a season
 * without its series.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 */
export async function getSeasonSeriesId(seasonId: string): Promise<string> {
	const [season] = await db
		.select({
			seriesId: seriesSeason.seriesId,
		})
		.from(seriesSeason)
		.where(eq(seriesSeason.id, seasonId))
		.limit(1);
	if (!season) {
		throw new SeasonNotFoundError(seasonId);
	}

	return season.seriesId;
}

/** An episode, by its season and its position in it. */
export interface EpisodeAddress {
	seasonId: string;
	/** Position within the season, from 1. */
	episode: number;
}

/** A season of a series as playback moves through it; see {@link getPlayableSeasons}. */
export interface PlayableSeason {
	id: string;
	kind: SeasonKind;
	/** Position among the series' seasons of the same kind, from 1. */
	number: number;
	/** The season's title, such as "Season 2"; see `Season.title`. */
	title: string;
	/** Whether the season is part of the story in watch order; see `Season.inWatchOrder`. */
	inWatchOrder: boolean;
	/**
	 * Whether the season is still coming out: some AniList entry its episodes
	 * are from has not finished.
	 */
	airing: boolean;
	/** The numbers of the episodes that can be played, in order. */
	episodes: number[];
	/**
	 * When the latest of those episodes came out, or `null` when none of
	 * them has a known date.
	 */
	releasedAt: Date | null;
}

/** The episodes around one; see {@link adjacentEpisodes}. */
export interface AdjacentEpisodes {
	previous: EpisodeAddress | null;
	next: EpisodeAddress | null;
	/**
	 * The first episode of the part that comes after, when `next` is `null`
	 * because playback does not go on into that part by itself. A viewer who
	 * wants to go on starts here.
	 */
	offered: EpisodeAddress | null;
}

/**
 * The seasons of each series in display order, keyed by series ID, with the
 * episodes of each that can be played: those it lists (see
 * {@link isEpisodeShown}), less extras only TMDB lists. An ID that does not
 * identify a series has no entry.
 */
export async function getPlayableSeasons(
	seriesIds: readonly string[],
): Promise<Map<string, PlayableSeason[]>> {
	if (seriesIds.length === 0) {
		return new Map();
	}

	const listed = await listedSeasonsOf(
		await db
			.select()
			.from(series)
			.where(inArray(series.id, [...seriesIds])),
	);
	const seasonIds = [...listed.values()].flatMap((seasons) =>
		seasons.map(({ season }) => season.id),
	);
	const airing = new Set(
		seasonIds.length > 0
			? (
					await db
						.selectDistinct({
							seasonId: seriesEpisode.seasonId,
						})
						.from(seriesEpisode)
						.innerJoin(animeTable, eq(animeTable.anilistId, seriesEpisode.anilistId))
						.where(
							and(
								inArray(seriesEpisode.seasonId, seasonIds),
								notInArray(animeTable.status, ["FINISHED", "CANCELLED"]),
							),
						)
				).map((row) => row.seasonId)
			: [],
	);

	return new Map(
		[...listed].map(([seriesId, seasons]) => [
			seriesId,
			seasons.map(({ season, episodes }) => {
				const playable = episodes.filter((row) => row.anilistId !== null);
				const released = playable.flatMap((row) =>
					row.airedAt
						? [row.airedAt.getTime()]
						: row.airDate
							? [Date.parse(`${row.airDate}T00:00:00Z`)]
							: [],
				);
				return {
					id: season.id,
					kind: season.kind,
					number: season.number,
					title: season.title,
					inWatchOrder: season.inWatchOrder,
					airing: airing.has(season.id),
					episodes: playable.map((row) => row.number),
					releasedAt: released.length > 0 ? new Date(Math.max(...released)) : null,
				};
			}),
		]),
	);
}

/**
 * The playable episodes before and after one, for moving through a title in
 * order, given the title's seasons.
 *
 * After a season's last episode comes the first of the next season in watch
 * order, but only when that is a regular season that has finished coming
 * out. A show does not play on into a season still airing, nor into a film,
 * an OVA, or a special: `next` is `null` there and `offered` is that
 * episode, for the viewer to start themselves. Once they do, it plays on
 * like any other.
 *
 * Before a season's first episode comes the last of the previous season in
 * watch order, whatever it is; extras are only before and after one another.
 * `next` is never an episode AniKoto does not carry yet. Each is `null` at
 * either end.
 *
 * @returns `null` when `seasonId` is not among the seasons.
 */
export function adjacentEpisodes(
	seasons: readonly PlayableSeason[],
	seasonId: string,
	episode: number,
): AdjacentEpisodes | null {
	const season = seasons.find((candidate) => candidate.id === seasonId);
	if (!season) {
		return null;
	}

	const alike = seasons.filter((candidate) => candidate.inWatchOrder === season.inWatchOrder);
	const at = alike.indexOf(season);
	const playable = alike.flatMap((candidate, index) =>
		candidate.episodes.map((number) => ({
			index,
			season: candidate,
			address: {
				seasonId: candidate.id,
				episode: number,
			},
		})),
	);

	const before = playable.findLast(
		(other) => other.index < at || (other.index === at && other.address.episode < episode),
	);
	const after = playable.find(
		(other) => other.index > at || (other.index === at && other.address.episode > episode),
	);
	const isHeldBack =
		after !== undefined &&
		after.index !== at &&
		(after.season.kind !== "season" || after.season.airing);

	return {
		previous: before?.address ?? null,
		next: isHeldBack ? null : (after?.address ?? null),
		offered: isHeldBack ? after.address : null,
	};
}

/**
 * {@link adjacentEpisodes} of an episode of a stored series.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to the series.
 */
export async function getAdjacentEpisodes(
	seriesId: string,
	seasonId: string,
	episode: number,
): Promise<AdjacentEpisodes> {
	const seasons = (await getPlayableSeasons([seriesId])).get(seriesId) ?? [];
	const adjacent = adjacentEpisodes(seasons, seasonId, episode);
	if (!adjacent) {
		throw new SeasonNotFoundError(seasonId);
	}

	return adjacent;
}

/**
 * Lists a season's episodes, numbered from 1, with the audio each can
 * be watched in and whether each is filler.
 *
 * AniKoto decides which episodes exist: an episode is listed once AniKoto
 * carries it and it has its details, as {@link isEpisodeShown} lays out.
 * An extra only TMDB lists is listed too.
 *
 * Both come from providers' stored episode lists, so a listing reads only
 * the database. An anime no provider has been looked up for yet is queued
 * for the scheduler, and its episodes' audio is `null` until it has run;
 * the scheduler keeps the lists current as the anime airs.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to the series.
 */
export async function getSeasonEpisodes(
	seriesId: string,
	seasonId: string,
): Promise<SeasonEpisode[]> {
	const [listed] = await listedSeasons(seriesId, seasonId);
	if (!listed) {
		throw new SeasonNotFoundError(seasonId);
	}

	const stills = new Map(
		(
			await db
				.select({
					number: seriesEpisode.number,
					stillUrl: effectiveStill,
				})
				.from(seriesEpisode)
				.innerJoin(series, eq(series.id, seriesId))
				.where(eq(seriesEpisode.seasonId, seasonId))
		).map((row) => [row.number, row.stillUrl]),
	);

	const listings = await findEpisodeListings(
		listed.episodes.flatMap((row) =>
			row.anilistId !== null && row.anilistEpisode !== null
				? [
						{
							anilistId: row.anilistId,
							episode: row.anilistEpisode,
						},
					]
				: [],
		),
	);

	return listed.episodes.map((row) => {
		const listing =
			row.anilistId !== null && row.anilistEpisode !== null
				? listings.get(anilistEpisodeKey(row.anilistId, row.anilistEpisode))
				: null;
		return {
			number: row.number,
			title: row.title,
			overview: row.overview,
			airDate: row.airDate,
			airedAt: row.airedAt?.toISOString() ?? null,
			runtimeMinutes: row.runtimeMinutes,
			stillUrl: stills.get(row.number) ?? null,
			// An extra no provider streams has no audio, and no provider to call it filler.
			audio: listing === null ? [] : (listing?.languages ?? null),
			filler: listing?.isFiller ?? false,
			extra: row.anilistId === null,
		};
	});
}

/**
 * Index entries read per title a browse page wants: a title's seasons, films,
 * and specials are separate entries that make one card.
 */
const indexEntriesPerSeries = 3;

/**
 * Whether AniKoto, which decides what can be watched, carries an index
 * entry: its catalogue names the entry, or the entry was matched to it.
 */
export const carriedByAniKoto = sql`(exists (select 1 from ${anikotoSeries} where ${anikotoSeries.anilistId} = ${animeSearch.anilistId}) or exists (select 1 from ${providerMapping} where ${providerMapping.provider} = ${aniKoto.id} and ${providerMapping.providerMediaId} is not null and ${providerMapping.anilistId} = ${animeSearch.anilistId}))`;

/**
 * Searches and filters the catalog, returning one card per title: a search
 * for a show finds the show once, not each of its seasons.
 *
 * Both are answered from the local search index, AniList's catalogue
 * mirrored, so they never wait on AniList or its rate limit. A text search
 * is ranked by how well titles match and how popular they are (see
 * {@link searchAnime}). Browsing without one orders the entries by `sort`
 * and lists only those AniKoto carries, since only they can be watched (see
 * {@link browseIndex}). Until the index has been filled once, browsing
 * follows AniList's page of entries instead, so a page can hold fewer cards
 * than `perPage` when several entries belong to one title.
 *
 * Reads only stored titles, so a search never waits on AniList or TMDB. An
 * entry whose title is not stored yet is queued for the scheduler and left
 * out of `items` until it is, with `isPreparing` set so the client can ask
 * again. Those on the page are listed in `preparing`, with what the search
 * index knows of them and where they are expected, so a client can show
 * them at once rather than a page that comes back short.
 *
 * @throws {@link InvalidInputError} when the query fails `BrowseQuerySchema`.
 * @throws {@link UpstreamUnavailableError} when AniList cannot be browsed
 *   before the index is filled.
 */
export async function browseSeries(query: BrowseQuery): Promise<
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
	const heard = (cards: SeriesCard[]) =>
		audio ? cards.filter((card) => card.audio.includes(audio)) : cards;
	if (await hasSearchIndex()) {
		const found =
			search === undefined
				? await browseIndex(filters, (page * perPage + 1) * indexEntriesPerSeries, carriedByAniKoto)
				: await searchAnime(search, filters);
		const ranked = found.map((entry) => entry.anilistId);
		const pageStart = (page - 1) * perPage;
		// One series more than the page holds tells whether another page follows.
		const { seriesIds, missing } = await seriesIdsFor(ranked, {
			wantedSeries: page * perPage + 1,
			pageStart,
			perPage,
		});
		const ordered = seriesInOrder(ranked, seriesIds);
		const indexed = new Map(found.map((entry) => [entry.anilistId, entry]));
		return {
			items: heard(await cardsOf(ordered.slice(pageStart, page * perPage))),
			page,
			perPage,
			hasNextPage: ordered.length > page * perPage,
			isPreparing: missing.length > 0,
			preparing: audio
				? []
				: preparingOn(missing, pageStart, perPage, (anilistId) => {
						const entry = indexed.get(anilistId);
						return (
							entry && {
								title: entry.english ?? entry.romaji ?? entry.native,
								format: toAnimeFormat(entry.format),
								year:
									entry.seasonYear ??
									(entry.startDate ? Number(entry.startDate.slice(0, 4)) : null),
							}
						);
					}),
		};
	}

	const found = await browseAnime(parsed.data);
	const anilistIds = found.items.map((anime) => anime.id);
	const { seriesIds, missing } = await seriesIdsFor(anilistIds, {
		wantedSeries: Number.POSITIVE_INFINITY,
		pageStart: 0,
		perPage: found.perPage,
	});
	const cards = new Map(found.items.map((anime) => [anime.id, anime]));
	return {
		items: heard(await cardsOf(seriesInOrder(anilistIds, seriesIds))),
		page: found.page,
		perPage: found.perPage,
		hasNextPage: found.hasNextPage,
		isPreparing: missing.length > 0,
		preparing: audio
			? []
			: preparingOn(missing, 0, Number.POSITIVE_INFINITY, (anilistId) => {
					const anime = cards.get(anilistId);
					return (
						anime && {
							title: anime.title.display,
							format: anime.format,
							year: anime.seasonYear,
						}
					);
				}),
	};
}

/**
 * The titles not stored yet among a page's places, where they are expected
 * on it, described by `describe`. Entries it knows nothing about are left
 * out.
 */
function preparingOn(
	missing: readonly {
		anilistId: number;
		place: number;
	}[],
	pageStart: number,
	perPage: number,
	describe: (anilistId: number) =>
		| (Omit<PreparingTitle, "anilistId" | "position" | "title"> & {
				title: string | null;
		  })
		| undefined,
): PreparingTitle[] {
	return missing.flatMap(({ anilistId, place }) => {
		const described = describe(anilistId);
		const position = place - pageStart;
		return described?.title && position >= 0 && position < perPage
			? [
					{
						...described,
						anilistId,
						title: described.title,
						position,
					},
				]
			: [];
	});
}

/** The distinct series of `anilistIds`, in the order their entries come. */
function seriesInOrder(anilistIds: readonly number[], seriesIds: ReadonlyMap<number, string>) {
	return [...new Set(anilistIds.flatMap((id) => seriesIds.get(id) ?? []))];
}

/** Cards for stored series, in the given order. */
async function cardsOf(seriesIds: readonly string[]) {
	const rows =
		seriesIds.length > 0
			? await db
					.select()
					.from(series)
					.where(inArray(series.id, [...seriesIds]))
			: [];
	const cards = await toSeriesCards(rows);
	return seriesIds.flatMap((id) => cards.get(id) ?? []);
}

/**
 * Finds the stored series of each entry, and queues for the scheduler the
 * entries among the first `window.wantedSeries` places whose series is not
 * stored yet. A stored series takes one place, and so does each entry not
 * stored yet, since its series is not known.
 *
 * The viewer is taken to be waiting on the page they asked for, the
 * `window.perPage` places from `window.pageStart`: entries there are laid
 * out ahead of anything else, and those further down after airing checks.
 * Suggestions ask for a small page, so a query typed letter by letter does
 * not queue every faint match of each prefix ahead of new episodes.
 *
 * @returns Each stored entry's series, and the entries the page wanted that
 *   are still being prepared, with their places.
 */
async function seriesIdsFor(
	anilistIds: readonly number[],
	window: {
		wantedSeries: number;
		pageStart: number;
		perPage: number;
	},
) {
	const found = await storedSeriesIds(anilistIds);
	const seen = new Set<string>();
	const missing: {
		anilistId: number;
		place: number;
	}[] = [];
	for (const anilistId of anilistIds) {
		const place = seen.size + missing.length;
		if (place >= window.wantedSeries) {
			break;
		}

		const seriesId = found.get(anilistId);
		if (seriesId) {
			seen.add(seriesId);
		} else {
			missing.push({
				anilistId,
				place,
			});
		}
	}

	const isWaitedOn = (place: number) =>
		place >= window.pageStart && place < window.pageStart + window.perPage;
	await Promise.all(
		missing.map(({ anilistId, place }) =>
			isWaitedOn(place)
				? scheduleSeriesStore(anilistId, "waiting", place - window.pageStart)
				: scheduleSeriesStore(anilistId, "current"),
		),
	);
	return {
		seriesIds: found,
		missing,
	};
}

/**
 * A series' seasons in display order, or only `seasonId` among them when
 * given, each with the episodes it lists (see {@link isEpisodeShown}) in
 * order. `episodeCount` counts only those.
 */
async function listedSeasons(seriesId: string, seasonId?: string) {
	const [title] = await db.select().from(series).where(eq(series.id, seriesId)).limit(1);
	return title ? ((await listedSeasonsOf([title], seasonId)).get(title.id) ?? []) : [];
}

/** {@link listedSeasons} of several series at once, keyed by series ID. */
async function listedSeasonsOf(titles: readonly (typeof series.$inferSelect)[], seasonId?: string) {
	const seasons =
		titles.length > 0
			? await db
					.select({
						seriesId: seriesSeason.seriesId,
						id: seriesSeason.id,
						kind: seriesSeason.kind,
						number: seriesSeason.number,
						title: seriesSeason.title,
						inWatchOrder: seriesSeason.inWatchOrder,
					})
					.from(seriesSeason)
					.where(
						and(
							inArray(
								seriesSeason.seriesId,
								titles.map((title) => title.id),
							),
							seasonId === undefined ? undefined : eq(seriesSeason.id, seasonId),
						),
					)
					.orderBy(asc(seriesSeason.position))
			: [];
	const rows =
		seasons.length > 0
			? await db
					.select()
					.from(seriesEpisode)
					.where(
						inArray(
							seriesEpisode.seasonId,
							seasons.map((season) => season.id),
						),
					)
					.orderBy(asc(seriesEpisode.number))
			: [];
	const onAniKoto = await loadAniKotoEpisodes(rows.flatMap((row) => row.anilistId ?? []));

	const now = new Date();
	return new Map(
		titles.map((title) => [
			title.id,
			seasons
				.filter((season) => season.seriesId === title.id)
				.map(({ seriesId: _, ...season }) => {
					const all = rows.filter((row) => row.seasonId === season.id);
					const episodes = all.filter((row) => isEpisodeShown(title, season, row, onAniKoto, now));
					return {
						season: {
							...season,
							episodeCount: episodes.length,
						},
						episodes,
						/** The episodes that aired but are still to come out; see {@link isEpisodeAwaited}. */
						awaited: all.filter((row) => isEpisodeAwaited(title, season, row, onAniKoto, now)),
					};
				}),
		]),
	);
}

/**
 * The seasons a series lists: those with an episode to show. A season whose
 * every episode is left out, such as extras AniKoto does not carry, is not
 * listed at all; it can still be loaded by its ID.
 */
function listedOnly(listed: Awaited<ReturnType<typeof listedSeasons>> = []) {
	return listed.flatMap(({ season }) => (season.episodeCount > 0 ? [season] : []));
}

/** Related titles that are stored, in display order. Titles still queued for storing are left out. */
async function relatedOf(seriesId: string): Promise<SeriesCard[]> {
	const rows = await db
		.select({
			series,
		})
		.from(seriesRelated)
		.innerJoin(seriesEntry, eq(seriesEntry.anilistId, seriesRelated.anilistId))
		.innerJoin(series, eq(series.id, seriesEntry.seriesId))
		.where(and(eq(seriesRelated.seriesId, seriesId), ne(series.id, seriesId)))
		.orderBy(asc(seriesRelated.position));

	const cards = await toSeriesCards(rows.map((row) => row.series));
	return [...cards.values()];
}

/** The artwork readers see: the chosen image, none when that was chosen, else the laid-out one. */
function effectiveArtwork(override: string | null, laidOut: string | null) {
	return override === noArtwork ? null : (override ?? laidOut);
}

/** Builds a card from a stored series row, with any artwork chosen over the laid-out one. */
function toSeriesCard(
	row: typeof series.$inferSelect,
	audio: ContentLanguage[],
): Omit<
	SeriesCard,
	"overview" | "score" | "genres" | "seasonCount" | "episodeCount" | "startSeasonId"
> {
	return {
		id: row.id,
		kind: row.kind,
		title: row.title,
		posterUrl: effectiveArtwork(row.posterUrlOverride, row.posterUrl),
		backdropUrl: effectiveArtwork(row.backdropUrlOverride, row.backdropUrl),
		logoUrl: effectiveArtwork(row.logoUrlOverride, row.logoUrl),
		logoScale: row.logoScale,
		logoOffsetX: row.logoOffsetX,
		logoOffsetY: row.logoOffsetY,
		year: row.startDate ? Number(row.startDate.slice(0, 4)) : null,
		status: row.status,
		audio,
	};
}

/** How far back {@link getLatestReleases} looks. */
const releaseWindowMs = 30 * day;

/**
 * When an episode came out: when it aired, or its air date's midnight UTC
 * when AniList has no airing time. `null` for an episode with neither.
 */
export const episodeReleasedAt = sql<Date>`coalesce(${seriesEpisode.airedAt}, (${seriesEpisode.airDate} || 'T00:00:00Z')::timestamptz)`;

/** Filters and paging for {@link getLatestReleases}. Validate untrusted input with this schema. */
export const ReleasesQuerySchema = BrowseQuerySchema.pick({
	format: true,
	audio: true,
	page: true,
	perPage: true,
});

export type ReleasesQuery = z.input<typeof ReleasesQuerySchema>;

/**
 * The titles with an episode out in the last 30 days, each with its latest
 * episode that can be watched, the latest first.
 *
 * An episode counts once its season lists it (see {@link isEpisodeShown}),
 * so an episode that has aired but that AniKoto does not carry yet is left
 * out until it does. Extras only TMDB lists never count. `format` and
 * `audio` apply to the AniList entry the latest episode belongs to, such as
 * a film, or a season that is dubbed. Reads only the database.
 *
 * @throws {@link InvalidInputError} when the query fails {@link ReleasesQuerySchema}.
 */
export async function getLatestReleases(
	query: ReleasesQuery,
	now = new Date(),
): Promise<Page<Release>> {
	const parsed = ReleasesQuerySchema.safeParse(query);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid releases query", {
			cause: parsed.error,
		});
	}

	const { format, audio, page, perPage } = parsed.data;
	const since = new Date(now.getTime() - releaseWindowMs);
	const candidates = await db
		.selectDistinct({
			seriesId: seriesSeason.seriesId,
		})
		.from(seriesEpisode)
		.innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
		.where(
			and(
				isNotNull(seriesEpisode.anilistId),
				gte(episodeReleasedAt, since),
				lte(episodeReleasedAt, now),
			),
		);
	const rows =
		candidates.length > 0
			? await db
					.select()
					.from(series)
					.where(
						inArray(
							series.id,
							candidates.map((candidate) => candidate.seriesId),
						),
					)
			: [];
	const listed = await listedSeasonsOf(rows);

	const latest = rows.flatMap((row) => {
		let found:
			| {
					seriesId: string;
					anilistId: number;
					seasonId: string;
					seasonTitle: string;
					episode: number;
					releasedAt: string;
			  }
			| undefined;
		for (const { season, episodes } of listed.get(row.id) ?? []) {
			for (const episode of episodes) {
				const at =
					episode.airedAt ??
					(episode.airDate === null ? null : new Date(`${episode.airDate}T00:00:00Z`));
				if (
					episode.anilistId !== null &&
					at !== null &&
					at >= since &&
					at <= now &&
					(!found || at.toISOString() >= found.releasedAt)
				) {
					found = {
						seriesId: row.id,
						anilistId: episode.anilistId,
						seasonId: season.id,
						seasonTitle: season.title,
						episode: episode.number,
						releasedAt: at.toISOString(),
					};
				}
			}
		}
		return found ? [found] : [];
	});

	const anilistIds = [...new Set(latest.map((release) => release.anilistId))];
	const [formats, languages] = await Promise.all([
		format && anilistIds.length > 0
			? db
					.select({
						anilistId: animeSearch.anilistId,
						format: animeSearch.format,
					})
					.from(animeSearch)
					.where(inArray(animeSearch.anilistId, anilistIds))
			: [],
		audio ? findAnimeLanguages(anilistIds) : new Map<number, ContentLanguage[]>(),
	]);
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
	const cards = await cardsFrom(
		rows.filter((row) => shownIds.has(row.id)),
		listed,
	);

	return {
		items: shown.flatMap(({ seriesId, anilistId: _, ...release }) => {
			const card = cards.get(seriesId);
			return card
				? [
						{
							series: card,
							...release,
						},
					]
				: [];
		}),
		page,
		perPage,
		hasNextPage: matching.length > page * perPage,
		isPreparing: false,
	};
}

/**
 * Builds the cards of stored series rows, keyed by series ID, with the audio
 * and the seasons and episodes each series lists. Reads only the database.
 */
export async function toSeriesCards(
	rows: readonly (typeof series.$inferSelect)[],
): Promise<Map<string, SeriesCard>> {
	return cardsFrom(rows, await listedSeasonsOf(rows));
}

/** {@link toSeriesCards} with the rows' seasons already listed. */
async function cardsFrom(
	rows: readonly (typeof series.$inferSelect)[],
	listed: Map<string, Awaited<ReturnType<typeof listedSeasons>>>,
): Promise<Map<string, SeriesCard>> {
	const ids = [...new Set(rows.map((row) => row.id))];
	const [entries, anchors] =
		ids.length > 0
			? await Promise.all([
					db
						.select({
							anilistId: seriesEntry.anilistId,
							seriesId: seriesEntry.seriesId,
						})
						.from(seriesEntry)
						.where(inArray(seriesEntry.seriesId, ids)),
					db
						.select({
							anilistId: animeTable.anilistId,
							media: animeTable.media,
						})
						.from(animeTable)
						.where(
							inArray(
								animeTable.anilistId,
								rows.map((row) => row.anchorAnilistId),
							),
						),
				])
			: [[], []];
	const languages = await findAnimeLanguages(entries.map((entry) => entry.anilistId));
	const anime = new Map(anchors.map((anchor) => [anchor.anilistId, toAnime(anchor.media)]));
	const order: ContentLanguage[] = ["dub", "sub", "raw"];

	return new Map(
		rows.map((row) => {
			const audio = new Set(
				entries.flatMap((entry) =>
					entry.seriesId === row.id ? (languages.get(entry.anilistId) ?? []) : [],
				),
			);
			const anchor = anime.get(row.anchorAnilistId);
			const all = listedOnly(listed.get(row.id));
			const seasons = all.filter((season) => season.kind === "season");
			return [
				row.id,
				{
					...toSeriesCard(
						row,
						order.filter((language) => audio.has(language)),
					),
					overview: row.overview ?? anchor?.description ?? null,
					score: anchor?.score ?? null,
					genres: anchor?.genres ?? [],
					seasonCount: seasons.length,
					episodeCount: seasons.reduce((total, season) => total + season.episodeCount, 0),
					startSeasonId: (all.find((season) => season.inWatchOrder) ?? all[0])?.id ?? null,
				},
			];
		}),
	);
}
