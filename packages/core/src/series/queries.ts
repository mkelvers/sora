import { and, asc, eq, gte, inArray, lte, or } from "drizzle-orm";
import type { z } from "zod";

import { toAnime, toAnimeFormat, type AnimeFormat } from "../catalog/models/anime";
import { getAnime } from "../catalog/queries/anime";
import { browseAnime, type Page } from "../catalog/queries/browse";
import { BrowseQuerySchema, type BrowseQuery } from "../catalog/queries/browse-query";
import { browseIndex, hasSearchIndex, searchAnime } from "../catalog/queries/search";
import { catalogSeriesAllowed, isCatalogFormat } from "../catalog/visibility";
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
import { EpisodeNotFoundError, InvalidInputError, SeriesNotFoundError } from "../errors";
import type {
	ContentLanguage,
	Episode,
	FranchisePart,
	PreparingTitle,
	Release,
	Series,
	SeriesCard,
} from "../models/series";
import { findAnimeLanguages, findEpisodeListings } from "../playback/episodes/versions";
import { scheduleSeriesStore } from "../scheduler/queue";
import { day, hour, minute } from "../time";
import { effectiveBackdrop, effectiveStill } from "./edges";
import {
	anilistEpisodeKey,
	carriedByAniKoto,
	episodeReleasedAt,
	expectedRelease,
	isEpisodeAwaited,
	isEpisodeShown,
	loadAniKotoEpisodes,
	releasedAtOf,
} from "./episodes";
import { franchiseParts } from "./franchise";
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
		.where(and(eq(series.id, seriesId), catalogSeriesAllowed))
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

	const current = franchise.find((part) => part.series_id === row.id);
	const seasons = franchise.filter((part) => part.role === "season");
	const isNextEpisodeAhead =
		row.nextEpisodeAiringAt !== null && row.nextEpisodeAiringAt > new Date();
	return {
		...cards.get(row.id)!,
		start_date: row.startDate,
		genres: anime.genres,
		tags: anime.tags,
		studios: anime.studios,
		score_count: indexed?.scoreCount ?? null,
		// An aired episode still to come out is next until it is listed, ahead of
		// the one AniList announces after it.
		next_episode:
			overdue ??
			(isNextEpisodeAhead && row.nextEpisodeNumber !== null && row.nextEpisodeAiringAt
				? {
						number: row.nextEpisodeNumber,
						airing_at: row.nextEpisodeAiringAt.toISOString(),
					}
				: null),
		backdrop_edges: found.edges,
		seasons: current && current.role !== "season" ? [current, ...seasons] : seasons,
		related: franchise.filter((part) => part.role === "related"),
	};
}

/**
 * The first of a series' awaited episodes (see {@link isEpisodeAwaited})
 * still expected to come out, with when it is expected (see
 * {@link expectedRelease}), or `null` when none is.
 */
async function overdueEpisode(row: SeriesRow, now = new Date()): Promise<Series["next_episode"]> {
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
				airing_at: first.expected.toISOString(),
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
		.where(and(eq(series.id, seriesId), catalogSeriesAllowed))
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
	const listed = await listedEpisodes(seriesId);
	const numbers = listed.map((row) => row.number);

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
	const row = await loadSeries(seriesId);

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
			air_date: episode.airDate,
			aired_at: episode.airedAt?.toISOString() ?? null,
			runtime_minutes: episode.runtimeMinutes,
			still_url: stillOf.get(episode.number) ?? null,
			audio: listing?.languages ?? null,
			filler: listing?.isFiller ?? false,
		};
	});
}

/**
 * One episode of a series, as {@link getSeriesEpisodes} lists it.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link EpisodeNotFoundError} when the series does not list the episode.
 */
export async function getSeriesEpisode(seriesId: string, number: number): Promise<Episode> {
	const episode = (await getSeriesEpisodes(seriesId)).find((episode) => episode.number === number);
	if (!episode) {
		throw new EpisodeNotFoundError(seriesId, number);
	}

	return episode;
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
		| (Omit<PreparingTitle, "anilist_id" | "position" | "title"> & {
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
						anilist_id: anilistId,
						title: described.title,
						position,
					},
				]
			: [];
	});
}

/** Cards for stored series, in the given order. */
async function cardsOf(seriesIds: readonly string[]) {
	const rows = await db
		.select()
		.from(series)
		.where(inArray(series.id, [...seriesIds]));
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

/**
 * A stored series' row.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 */
async function loadSeries(seriesId: string) {
	const [row] = await db
		.select()
		.from(series)
		.where(and(eq(series.id, seriesId), catalogSeriesAllowed))
		.limit(1);
	if (!row) {
		throw new SeriesNotFoundError(seriesId);
	}

	return row;
}

/** A series' stored episodes that it lists (see {@link isEpisodeShown}), in order. */
async function listedEpisodes(seriesId: string) {
	const row = await loadSeries(seriesId);
	const listed = await listedEpisodesOf([row]);

	return listed.get(row.id) ?? [];
}

/** {@link listedEpisodes} of several series at once, keyed by series ID. */
export async function listedEpisodesOf(titles: readonly SeriesRow[]) {
	const rows = await db
		.select()
		.from(seriesEpisode)
		.where(
			inArray(
				seriesEpisode.seriesId,
				titles.map((title) => title.id),
			),
		)
		.orderBy(asc(seriesEpisode.number));
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
 * to is not reached. An entry related only as `OTHER` is reached but not
 * followed through: crossovers, such as Ple Ple Pleiades × Kage-Jitsu!, are
 * `OTHER` to each franchise they join, and following them would merge the
 * franchises.
 */
export async function franchiseIds(anilistId: number): Promise<number[]> {
	const reached = new Set([anilistId]);
	let frontier = [anilistId];
	while (frontier.length > 0 && reached.size <= franchiseLimit) {
		const edges = await db
			.select({
				from: series.anilistId,
				to: seriesRelated.anilistId,
				relation: seriesRelated.relation,
			})
			.from(seriesRelated)
			.innerJoin(series, eq(series.id, seriesRelated.seriesId))
			.where(or(inArray(series.anilistId, frontier), inArray(seriesRelated.anilistId, frontier)));

		frontier = [];
		for (const edge of edges.toSorted(
			(left, right) => Number(left.relation === "OTHER") - Number(right.relation === "OTHER"),
		)) {
			for (const id of [edge.from, edge.to]) {
				if (!reached.has(id) && reached.size <= franchiseLimit) {
					reached.add(id);
					if (edge.relation !== "OTHER") {
						frontier.push(id);
					}
				}
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
 * to watch, and the seasons announced but yet to come out, which the page
 * shows as coming soon. Other titles yet to come out, those still queued for
 * storing, and music videos, are left out, though the series itself is always
 * listed. Whether
 * a title has come out is told by its listed episodes, not by AniList's
 * status, which reads "not yet released" until its airing check runs, often
 * well after the first episode can be watched.
 */
async function franchiseOf(row: SeriesRow): Promise<FranchisePart[]> {
	const anilistIds = await franchiseIds(row.anilistId);
	const rows = await db.select().from(series).where(inArray(series.anilistId, anilistIds));
	const titles = [row, ...rows];
	const [cards, relations] = await Promise.all([
		toSeriesCards(titles),
		db
			.select({
				from: series.anilistId,
				to: seriesRelated.anilistId,
				relation: seriesRelated.relation,
			})
			.from(seriesRelated)
			.innerJoin(series, eq(series.id, seriesRelated.seriesId))
			.where(
				and(
					inArray(
						seriesRelated.seriesId,
						titles.map((title) => title.id),
					),
					inArray(seriesRelated.relation, [
						"SEQUEL",
						"PREQUEL",
						"ALTERNATIVE",
						"SUMMARY",
						"COMPILATION",
					]),
				),
			),
	]);

	return franchiseParts(
		titles.flatMap((title) => {
			const card = cards.get(title.id);
			const isListed =
				title.id === row.id ||
				(card !== undefined &&
					card.format !== "MUSIC" &&
					(card.episode_count > 0 ||
						(title.status === "NOT_YET_RELEASED" &&
							card.format !== null &&
							["TV", "TV_SHORT", "ONA"].includes(card.format))));
			return card && isListed
				? [
						{
							seriesId: card.id,
							anilistId: title.anilistId,
							title: card.title,
							format: card.format,
							startDate: title.startDate,
							episodeCount: card.episode_count,
						},
					]
				: [];
		}),
		relations.flatMap(({ from, to, relation }) =>
			relation === "SEQUEL"
				? [[from, to] as const]
				: relation === "PREQUEL"
					? [[to, from] as const]
					: [],
		),
		{
			currentId: row.anilistId,
			alternatives: relations
				.filter(({ relation }) => relation === "ALTERNATIVE")
				.map(({ from, to }) => [from, to] as const),
			summaries: relations
				.filter(({ relation }) => relation === "SUMMARY" || relation === "COMPILATION")
				.map(({ to }) => to),
		},
	).map((part) => ({
		...part,
		card: cards.get(part.series_id)!,
	}));
}

/** The artwork readers see: the chosen image, none when that was chosen, else the laid-out one. */
function effectiveArtwork(override: string | null, laidOut: string | null) {
	return override === noArtwork ? null : (override ?? laidOut);
}

/** How far back {@link getLatestReleases} looks. */
const releaseWindowMs = 30 * day;

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
		.where(and(gte(episodeReleasedAt, since), lte(episodeReleasedAt, now)));
	const rows = await db
		.select()
		.from(series)
		.where(
			and(
				catalogSeriesAllowed,
				inArray(
					series.id,
					candidates.map((candidate) => candidate.seriesId),
				),
			),
		);
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
			const at = releasedAtOf(episode);
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
		format
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
		items: shown.flatMap(({ seriesId, episode, releasedAt }) => {
			const card = cards.get(seriesId);
			return card
				? [
						{
							series: card,
							episode,
							released_at: releasedAt,
							...releaseAge(releasedAt, now.getTime()),
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

const formatNames: Record<AnimeFormat, string> = {
	TV: "Series",
	TV_SHORT: "Short",
	MOVIE: "Movie",
	SPECIAL: "Special",
	OVA: "OVA",
	ONA: "ONA",
	MUSIC: "Music",
};

const statusNames: Partial<Record<string, string>> = {
	RELEASING: "Airing",
	NOT_YET_RELEASED: "Upcoming",
};

const relativeTime = new Intl.RelativeTimeFormat("en", {
	numeric: "always",
});

/** How long ago a release came out, in words, and the stretch of time it falls in. */
function releaseAge(releasedAt: string, now: number): Pick<Release, "released_ago" | "period"> {
	const age = Math.max(0, now - Date.parse(releasedAt));
	const minutes = Math.floor(age / minute);
	const hours = Math.floor(age / hour);

	return {
		released_ago:
			minutes < 60
				? relativeTime.format(-Math.max(1, minutes), "minute")
				: hours < 24
					? relativeTime.format(-hours, "hour")
					: relativeTime.format(-Math.floor(age / day), "day"),
		period: age < day ? "Last 24 hours" : age < 7 * day ? "This past week" : "Earlier",
	};
}

/**
 * Builds visible cards of stored series rows, keyed by series ID, with each
 * title's audio and listed episodes. Short TV series are omitted. Reads only the
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
		db
			.select({
				anilistId: animeTable.anilistId,
				media: animeTable.media,
			})
			.from(animeTable)
			.where(inArray(animeTable.anilistId, anilistIds)),
		findAnimeLanguages(anilistIds),
		db.select().from(titleArtwork).where(inArray(titleArtwork.key, keys)),
	]);
	const anime = new Map(stored.map((row) => [row.anilistId, toAnime(row.media)]));
	const artwork = new Map(chosen.map((row) => [row.key, row]));
	const order: ContentLanguage[] = ["dub", "sub", "raw"];

	return new Map(
		rows.flatMap((row) => {
			const audio = new Set(languages.get(row.anilistId) ?? []);
			const details = anime.get(row.anilistId);
			if (!isCatalogFormat(details?.format)) return [];
			const title = artwork.get(row.key);
			return [
				[
					row.id,
					{
						id: row.id,
						kind: row.kind,
						format: details?.format ?? null,
						title: row.title,
						poster_url: effectiveArtwork(row.posterUrlOverride, row.posterUrl),
						backdrop_url: effectiveArtwork(title?.backdropUrlOverride ?? null, row.backdropUrl),
						logo_url: effectiveArtwork(title?.logoUrlOverride ?? null, row.logoUrl),
						logo_scale: title?.logoScale ?? 1,
						logo_offset_x: title?.logoOffsetX ?? 0,
						logo_offset_y: title?.logoOffsetY ?? 0,
						year: row.startDate ? Number(row.startDate.slice(0, 4)) : null,
						status: row.status,
						audio: order.filter((language) => audio.has(language)),
						overview: row.overview ?? details?.description ?? null,
						score: details?.score ?? null,
						genres: details?.genres ?? [],
						episode_count: listed.get(row.id)?.length ?? 0,
						details: [
							row.startDate?.slice(0, 4),
							details?.format && formatNames[details.format],
							row.status && statusNames[row.status],
						]
							.filter(Boolean)
							.join(" · "),
					},
				] as const,
			];
		}),
	);
}
