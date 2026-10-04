import { and, asc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
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
	animeScheduleRelease,
	animeScheduleShow,
	animeSearch,
	imageEdge,
	noArtwork,
	series,
	seriesEpisode,
	seriesRelated,
	titleArtwork,
} from "../database/schema";
import { InvalidInputError, SeriesNotFoundError } from "../errors";
import { findAnimeLanguages, findEpisodeListings } from "../playback/episodes/versions";
import { scheduleSeriesStore } from "../scheduler/queue";
import { day } from "../time";
import { effectiveBackdrop, effectiveStill } from "./edges";
import {
	anilistEpisodeKey,
	carriedByAniKoto,
	expectedRelease,
	isEpisodeAwaited,
	isEpisodeShown,
	loadAniKotoEpisodes,
} from "./episodes";
import { franchiseParts, type FranchisePart } from "./franchise";
import type {
	ContentLanguage,
	Episode,
	PreparingTitle,
	Release,
	Series,
	SeriesCard,
} from "./models";
import { storedSeriesIds } from "./store";

type SeriesRow = typeof series.$inferSelect;

/**
 * Loads a title's page: its details and the other titles of its franchise.
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

	const [anime, cards, franchise, overdue, [indexed]] = await Promise.all([
		getAnime(row.anilistId),
		toSeriesCards([row]),
		franchiseOf(row),
		overdueEpisode(row),
		db
			.select({
				scoreCount: animeSearch.scoreCount,
			})
			.from(animeSearch)
			.where(eq(animeSearch.anilistId, row.anilistId))
			.limit(1),
	]);

	const isNextEpisodeAhead =
		row.nextEpisodeAiringAt !== null && row.nextEpisodeAiringAt > new Date();
	return {
		...cards.get(row.id)!,
		startDate: row.startDate,
		genres: anime.genres,
		tags: anime.tags,
		studios: anime.studios,
		scoreCount: indexed?.scoreCount ?? null,
		// An aired episode still to come out is next until it is listed, ahead of
		// the one AniList announces after it.
		nextEpisode:
			overdue ??
			(isNextEpisodeAhead && row.nextEpisodeNumber !== null && row.nextEpisodeAiringAt
				? {
						number: row.nextEpisodeNumber,
						airingAt: row.nextEpisodeAiringAt.toISOString(),
					}
				: null),
		backdropEdges: found.edges,
		franchise,
	};
}

/**
 * The first of a series' awaited episodes (see {@link isEpisodeAwaited})
 * still expected to come out, with when it is expected (see
 * {@link expectedRelease}), or `null` when none is.
 */
async function overdueEpisode(row: SeriesRow, now = new Date()): Promise<Series["nextEpisode"]> {
	const [episodes, onAniKoto] = await Promise.all([
		db
			.select()
			.from(seriesEpisode)
			.where(eq(seriesEpisode.seriesId, row.id))
			.orderBy(asc(seriesEpisode.number)),
		loadAniKotoEpisodes([row.anilistId]),
	]);
	const awaited = episodes.filter((episode) => isEpisodeAwaited(row, episode, onAniKoto, now));
	if (awaited.length === 0) {
		return null;
	}

	const scheduled = await db
		.select({
			episode: animeScheduleRelease.episode,
			airType: animeScheduleRelease.airType,
			airsAt: animeScheduleRelease.airsAt,
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
			const expected = episode.airedAt
				? expectedRelease(episode.airedAt, scheduledAt.get(episode.number) ?? null, now)
				: null;
			return expected
				? [
						{
							number: episode.number,
							expected,
						},
					]
				: [];
		})
		.toSorted((left, right) => left.expected.getTime() - right.expected.getTime());

	return first
		? {
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
 * The episodes before and after one, for moving through a title in order.
 *
 * Only the episodes the title lists count (see {@link isEpisodeShown}), so
 * `next` is never an episode AniKoto does not carry yet. Each is `null` at
 * either end: playing never runs on into another title, such as the next
 * season.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getAdjacentEpisodes(
	seriesId: string,
	episode: number,
): Promise<{
	previous: number | null;
	next: number | null;
}> {
	const numbers = (await listedEpisodes(seriesId)).map((row) => row.number);

	return {
		previous: numbers.findLast((number) => number < episode) ?? null,
		next: numbers.find((number) => number > episode) ?? null,
	};
}

/**
 * Lists a title's episodes, numbered from 1, with the audio each can be
 * watched in and whether each is filler.
 *
 * AniKoto decides which episodes exist: an episode is listed once AniKoto
 * carries it and it has its details, as {@link isEpisodeShown} lays out.
 *
 * Both come from providers' stored episode lists, so a listing reads only
 * the database. An anime no provider has been looked up for yet is queued
 * for the scheduler, and its episodes' audio is `null` until it has run;
 * the scheduler keeps the lists current as the anime airs.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
export async function getSeriesEpisodes(seriesId: string): Promise<Episode[]> {
	const [row] = await db.select().from(series).where(eq(series.id, seriesId)).limit(1);
	if (!row) {
		throw new SeriesNotFoundError(seriesId);
	}

	const [listed, stills] = await Promise.all([
		listedEpisodesOf([row]),
		db
			.select({
				number: seriesEpisode.number,
				stillUrl: effectiveStill,
			})
			.from(seriesEpisode)
			.innerJoin(series, eq(series.id, seriesEpisode.seriesId))
			.where(eq(seriesEpisode.seriesId, seriesId)),
	]);
	const episodes = listed.get(seriesId) ?? [];
	const stillOf = new Map(stills.map((still) => [still.number, still.stillUrl]));
	const listings = await findEpisodeListings(
		episodes.map((episode) => ({
			anilistId: row.anilistId,
			episode: episode.number,
		})),
	);

	return episodes.map((episode) => {
		const listing = listings.get(anilistEpisodeKey(row.anilistId, episode.number));
		return {
			number: episode.number,
			title: episode.title,
			overview: episode.overview,
			airDate: episode.airDate,
			airedAt: episode.airedAt?.toISOString() ?? null,
			runtimeMinutes: episode.runtimeMinutes,
			stillUrl: stillOf.get(episode.number) ?? null,
			audio: listing?.languages ?? null,
			filler: listing?.isFiller ?? false,
		};
	});
}

/**
 * Searches and filters the catalog, returning one card per AniList entry:
 * a show's seasons, films, and OVAs are each a title of their own.
 *
 * Both are answered from the local search index, AniList's catalogue
 * mirrored, so they never wait on AniList or its rate limit. A text search
 * is ranked by how well titles match and how popular they are (see
 * {@link searchAnime}). Browsing without one orders the entries by `sort`
 * and lists only those AniKoto carries, since only they can be watched (see
 * {@link browseIndex}). Until the index has been filled once, browsing
 * follows AniList's page of entries instead.
 *
 * Reads only stored titles, so a search never waits on AniList or TMDB. An
 * entry that is not stored yet is queued for the scheduler and left out of
 * `items` until it is, with `isPreparing` set so the client can ask again.
 * Those on the page are listed in `preparing`, with what the search index
 * knows of them and where they are expected, so a client can show them at
 * once rather than a page that comes back short.
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
		// One entry more than the page holds tells whether another page follows.
		const found =
			search === undefined
				? await browseIndex(filters, page * perPage + 1, carriedByAniKoto)
				: await searchAnime(search, filters);
		const ranked = found.map((entry) => entry.anilistId);
		const pageStart = (page - 1) * perPage;
		const { seriesIds, missing } = await seriesIdsFor(ranked, {
			wanted: page * perPage + 1,
			pageStart,
			perPage,
		});
		const ordered = ranked.flatMap((anilistId) => seriesIds.get(anilistId) ?? []);
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
		wanted: Number.POSITIVE_INFINITY,
		pageStart: 0,
		perPage: found.perPage,
	});
	const cards = new Map(found.items.map((anime) => [anime.id, anime]));
	return {
		items: heard(await cardsOf(anilistIds.flatMap((anilistId) => seriesIds.get(anilistId) ?? []))),
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
 * entries among the first `window.wanted` that are not stored yet.
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
		wanted: number;
		pageStart: number;
		perPage: number;
	},
) {
	const found = await storedSeriesIds(anilistIds);
	const missing = anilistIds.slice(0, window.wanted).flatMap((anilistId, place) =>
		found.has(anilistId)
			? []
			: [
					{
						anilistId,
						place,
					},
				],
	);

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

/** A series' stored episodes that it lists (see {@link isEpisodeShown}), in order. */
async function listedEpisodes(seriesId: string) {
	const [row] = await db.select().from(series).where(eq(series.id, seriesId)).limit(1);
	if (!row) {
		throw new SeriesNotFoundError(seriesId);
	}

	return (await listedEpisodesOf([row])).get(row.id) ?? [];
}

/** {@link listedEpisodes} of several series at once, keyed by series ID. */
async function listedEpisodesOf(titles: readonly SeriesRow[]) {
	const rows =
		titles.length > 0
			? await db
					.select()
					.from(seriesEpisode)
					.where(
						inArray(
							seriesEpisode.seriesId,
							titles.map((title) => title.id),
						),
					)
					.orderBy(asc(seriesEpisode.number))
			: [];
	const onAniKoto = await loadAniKotoEpisodes(titles.map((title) => title.anilistId));

	const now = new Date();
	return new Map(
		titles.map((title) => [
			title.id,
			rows.filter((row) => row.seriesId === title.id && isEpisodeShown(title, row, onAniKoto, now)),
		]),
	);
}

/** How many entries {@link franchiseIds} reaches at most. */
const franchiseLimit = 60;

/**
 * The AniList entries of an entry's franchise, itself left out, the closest
 * related first.
 *
 * A franchise is every entry reached by following AniList's relations (see
 * `seriesRelated`) from series to series, in either direction: a series
 * stored before its sequel was announced is still found from the sequel.
 * Only stored series are followed through, so an entry none of them relates
 * to is not reached.
 */
export async function franchiseIds(anilistId: number): Promise<number[]> {
	const reached = new Set([anilistId]);
	let frontier = [anilistId];
	while (frontier.length > 0 && reached.size <= franchiseLimit) {
		const edges = await db
			.select({
				from: series.anilistId,
				to: seriesRelated.anilistId,
			})
			.from(seriesRelated)
			.innerJoin(series, eq(series.id, seriesRelated.seriesId))
			.where(or(inArray(series.anilistId, frontier), inArray(seriesRelated.anilistId, frontier)));

		frontier = [];
		for (const id of edges.flatMap((edge) => [edge.from, edge.to])) {
			if (!reached.has(id) && reached.size <= franchiseLimit) {
				reached.add(id);
				frontier.push(id);
			}
		}
	}

	reached.delete(anilistId);
	return [...reached];
}

/** Stored series in release order, the earliest first; those undated last. */
export function byStartDate(rows: readonly SeriesRow[]) {
	return rows.toSorted(
		(left, right) =>
			(left.startDate ?? "9999").localeCompare(right.startDate ?? "9999") ||
			left.anilistId - right.anilistId,
	);
}

/**
 * The stored titles of a series' franchise (see {@link franchiseIds}), this
 * one included, as {@link franchiseParts} lists them: those with an episode
 * to watch. Titles yet to come out or still queued for storing, and music
 * videos, are left out, though the series itself is always listed. Whether
 * a title has come out is told by its listed episodes, not by AniList's
 * status, which reads "not yet released" until its airing check runs, often
 * well after the first episode can be watched.
 */
async function franchiseOf(row: SeriesRow): Promise<FranchisePart[]> {
	const anilistIds = await franchiseIds(row.anilistId);
	const rows =
		anilistIds.length > 0
			? await db.select().from(series).where(inArray(series.anilistId, anilistIds))
			: [];
	const titles = [row, ...rows];
	const [cards, sequels] = await Promise.all([
		toSeriesCards(titles),
		db
			.select({
				from: series.anilistId,
				to: seriesRelated.anilistId,
			})
			.from(seriesRelated)
			.innerJoin(series, eq(series.id, seriesRelated.seriesId))
			.where(
				and(
					inArray(
						seriesRelated.seriesId,
						titles.map((title) => title.id),
					),
					inArray(seriesRelated.relation, ["SEQUEL", "PREQUEL"]),
				),
			),
	]);

	return franchiseParts(
		titles.flatMap((title) => {
			const card = cards.get(title.id);
			const isListed =
				title.id === row.id ||
				(card !== undefined && card.format !== "MUSIC" && card.episodeCount > 0);
			return card && isListed
				? [
						{
							seriesId: card.id,
							anilistId: title.anilistId,
							title: card.title,
							format: card.format,
							startDate: title.startDate,
							episodeCount: card.episodeCount,
						},
					]
				: [];
		}),
		sequels.map(({ from, to }) => [from, to] as const),
	);
}

/** The artwork readers see: the chosen image, none when that was chosen, else the laid-out one. */
function effectiveArtwork(override: string | null, laidOut: string | null) {
	return override === noArtwork ? null : (override ?? laidOut);
}

/** How far back {@link getLatestReleases} looks. */
const releaseWindowMs = 30 * day;

/**
 * When an episode came out: when it aired, or its air date's midnight UTC
 * when AniList has no airing time.
 */
const releasedAt = sql<Date>`coalesce(${seriesEpisode.airedAt}, (${seriesEpisode.airDate} || 'T00:00:00Z')::timestamptz)`;

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
 * An episode counts once its title lists it (see {@link isEpisodeShown}),
 * so an episode that has aired but that AniKoto does not carry yet is left
 * out until it does. `format` and `audio` apply to the title's AniList
 * entry. Reads only the database.
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
			seriesId: seriesEpisode.seriesId,
		})
		.from(seriesEpisode)
		.where(and(gte(releasedAt, since), lte(releasedAt, now)));
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
	const listed = await listedEpisodesOf(rows);

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
			const at =
				episode.airedAt ??
				(episode.airDate === null ? null : new Date(`${episode.airDate}T00:00:00Z`));
			if (
				at !== null &&
				at >= since &&
				at <= now &&
				(!found || at.toISOString() >= found.releasedAt)
			) {
				found = {
					seriesId: row.id,
					anilistId: row.anilistId,
					episode: episode.number,
					releasedAt: at.toISOString(),
				};
			}
		}
		return found ? [found] : [];
	});

	const anilistIds = latest.map((release) => release.anilistId);
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
 * each can be watched in and the episodes each lists. Reads only the
 * database.
 */
export async function toSeriesCards(rows: readonly SeriesRow[]): Promise<Map<string, SeriesCard>> {
	return cardsFrom(rows, await listedEpisodesOf(rows));
}

/** {@link toSeriesCards} with the rows' episodes already listed. */
async function cardsFrom(
	rows: readonly SeriesRow[],
	listed: Awaited<ReturnType<typeof listedEpisodesOf>>,
): Promise<Map<string, SeriesCard>> {
	const anilistIds = rows.map((row) => row.anilistId);
	const keys = [...new Set(rows.map((row) => row.key))];
	const [stored, languages, chosen] = await Promise.all([
		anilistIds.length > 0
			? db
					.select({
						anilistId: animeTable.anilistId,
						media: animeTable.media,
					})
					.from(animeTable)
					.where(inArray(animeTable.anilistId, anilistIds))
			: [],
		findAnimeLanguages(anilistIds),
		keys.length > 0 ? db.select().from(titleArtwork).where(inArray(titleArtwork.key, keys)) : [],
	]);
	const anime = new Map(stored.map((row) => [row.anilistId, toAnime(row.media)]));
	const artwork = new Map(chosen.map((row) => [row.key, row]));
	const order: ContentLanguage[] = ["dub", "sub", "raw"];

	return new Map(
		rows.map((row) => {
			const audio = new Set(languages.get(row.anilistId) ?? []);
			const details = anime.get(row.anilistId);
			const title = artwork.get(row.key);
			return [
				row.id,
				{
					id: row.id,
					kind: row.kind,
					format: details?.format ?? null,
					title: row.title,
					posterUrl: effectiveArtwork(row.posterUrlOverride, row.posterUrl),
					backdropUrl: effectiveArtwork(title?.backdropUrlOverride ?? null, row.backdropUrl),
					logoUrl: effectiveArtwork(title?.logoUrlOverride ?? null, row.logoUrl),
					logoScale: title?.logoScale ?? 1,
					logoOffsetX: title?.logoOffsetX ?? 0,
					logoOffsetY: title?.logoOffsetY ?? 0,
					year: row.startDate ? Number(row.startDate.slice(0, 4)) : null,
					status: row.status,
					audio: order.filter((language) => audio.has(language)),
					overview: row.overview ?? details?.description ?? null,
					score: details?.score ?? null,
					genres: details?.genres ?? [],
					episodeCount: listed.get(row.id)?.length ?? 0,
				},
			];
		}),
	);
}
