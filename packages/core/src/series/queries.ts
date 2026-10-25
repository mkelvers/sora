import { day, hour, minute, defined } from "@sora/shared";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import type { z } from "zod";

import { toAnime, toAnimeFormat } from "../catalog/models/anime";
import type { AnimeFormat } from "../catalog/models/anime";
import { getAnime } from "../catalog/queries/anime";
import { browseAnime } from "../catalog/queries/browse";
import type { Page } from "../catalog/queries/browse";
import { BrowseQuerySchema } from "../catalog/queries/browse-query";
import type { BrowseQuery } from "../catalog/queries/browse-query";
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
import { effectiveBackdrop, effectiveStill } from "./edges";
import {
	anilistEpisodeKey,
	carriedByAniKoto,
	expectedRelease,
	isEpisodeAwaited,
	isEpisodeShown,
	loadAniKotoEpisodes,
	releasedAtOf,
	releasedBetween,
} from "./episodes";
import type { EpisodeListingRow } from "./episodes";
import { franchiseParts, isNamedAfter } from "./franchise";
import { franchiseRoles } from "./roles";
import { storedSeriesIds } from "./store";

type SeriesRow = typeof series.$inferSelect;

/** The rows each title lists (see {@link isEpisodeShown}), grouped by series ID. */
const keepListed = <TRow extends EpisodeListingRow & { seriesId: string }>(
	titles: readonly SeriesRow[],
	rows: readonly TRow[],
	onAniKoto: Awaited<ReturnType<typeof loadAniKotoEpisodes>>,
) => {
	const now = new Date();
	const bySeries = Map.groupBy(rows, (row) => row.seriesId);
	return new Map(
		titles.map((title) => [
			title.id,
			(bySeries.get(title.id) ?? []).filter((row) => isEpisodeShown(title, row, onAniKoto, now)),
		]),
	);
};

/**
 * {@link listedEpisodesOf} with only what telling whether and when an episode
 * came out takes, for callers that count episodes or look at their dates:
 * titles' titles and overviews are the bulk of a long series' rows.
 */
export const listedEpisodeDatesOf = async (titles: readonly SeriesRow[]) => {
	const [rows, onAniKoto] = await Promise.all([
		db
			.select({
				airDate: seriesEpisode.airDate,
				airedAt: seriesEpisode.airedAt,
				number: seriesEpisode.number,
				seriesId: seriesEpisode.seriesId,
				tmdbEpisodeNumber: seriesEpisode.tmdbEpisodeNumber,
			})
			.from(seriesEpisode)
			.where(
				inArray(
					seriesEpisode.seriesId,
					titles.map((title) => title.id),
				),
			)
			.orderBy(asc(seriesEpisode.number)),
		loadAniKotoEpisodes(titles.map((title) => title.anilistId)),
	]);

	return keepListed(titles, rows, onAniKoto);
};

/** The artwork readers see: the chosen image, none when that was chosen, else the laid-out one. */
const effectiveArtwork = (override: string | null, laidOut: string | null) =>
	override === noArtwork ? null : (override ?? laidOut);

const formatNames: Record<AnimeFormat, string> = {
	MOVIE: "Movie",
	MUSIC: "Music",
	ONA: "ONA",
	OVA: "OVA",
	SPECIAL: "Special",
	TV: "Series",
	TV_SHORT: "Short",
};

const statusNames: Partial<Record<string, string>> = {
	NOT_YET_RELEASED: "Upcoming",
	RELEASING: "Airing",
};

/** The artwork a card shows: the chosen image or the laid-out one, and where the logo sits. */
const artworkOf = (row: SeriesRow, title: typeof titleArtwork.$inferSelect | undefined) => ({
	backdrop_url: effectiveArtwork(title?.backdropUrlOverride ?? null, row.backdropUrl),
	logo_offset_x: title?.logoOffsetX ?? 0,
	logo_offset_y: title?.logoOffsetY ?? 0,
	logo_scale: title?.logoScale ?? 1,
	logo_url: effectiveArtwork(title?.logoUrlOverride ?? null, row.logoUrl),
	poster_url: effectiveArtwork(row.posterUrlOverride, row.posterUrl),
});

/** A card's line of year, format, and status. */
const detailsLineOf = (row: SeriesRow, format: AnimeFormat | null | undefined) =>
	[row.startDate?.slice(0, 4), format && formatNames[format], row.status && statusNames[row.status]]
		.filter(Boolean)
		.join(" · ");

/** A stored series as a card, from what is known of its anime, chosen artwork, audio, and episodes. */
const cardOf = (
	row: SeriesRow,
	known: {
		audio: ContentLanguage[];
		details: ReturnType<typeof toAnime> | undefined;
		episodeCount: number;
		title: typeof titleArtwork.$inferSelect | undefined;
	},
): SeriesCard => {
	const { audio, details, episodeCount, title } = known;
	return {
		audio,
		...artworkOf(row, title),
		details: detailsLineOf(row, details?.format),
		episode_count: episodeCount,
		format: details?.format ?? null,
		genres: details?.genres ?? [],
		id: row.id,
		kind: row.kind,
		overview: row.overview ?? details?.description ?? null,
		score: details?.score ?? null,
		status: row.status,
		title: row.title,
		year: row.startDate ? Number(row.startDate.slice(0, 4)) : null,
	};
};

/** {@link toSeriesCards} with the rows' episodes already listed. */
const cardsFrom = async (
	rows: readonly SeriesRow[],
	listed: Awaited<ReturnType<typeof listedEpisodeDatesOf>>,
	includeHiddenIds: readonly string[] = [],
): Promise<Map<string, SeriesCard>> => {
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
			const details = anime.get(row.anilistId);
			if (!isCatalogFormat(details?.format) && !includeHiddenIds.includes(row.id)) {
				return [];
			}
			const audio = new Set(languages.get(row.anilistId));
			return [
				[
					row.id,
					cardOf(row, {
						audio: order.filter((language) => audio.has(language)),
						details,
						episodeCount: listed.get(row.id)?.length ?? 0,
						title: artwork.get(row.key),
					}),
				] as const,
			];
		}),
	);
};

/**
 * Builds visible cards of stored series rows, keyed by series ID, with each
 * title's audio and listed episodes. Catalogue-hidden formats are omitted unless
 * their IDs are explicitly included for a saved watchlist or selected title.
 * Reads only the database.
 */
export const toSeriesCards = async (
	rows: readonly SeriesRow[],
	includeHiddenIds: readonly string[] = [],
): Promise<Map<string, SeriesCard>> =>
	cardsFrom(rows, await listedEpisodeDatesOf(rows), includeHiddenIds);

/** How many entries beyond the sequel chain {@link franchiseIds} reaches at most. */
const franchiseLimit = 60;

const rank = (relation: string) => {
	if (relation === "SEQUEL" || relation === "PREQUEL") {
		return 0;
	}
	return relation === "OTHER" ? 2 : 1;
};

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
 * franchises. A one-off special that lists another as `OTHER` while the other
 * lists it as something else, such as `PARENT`, is a crossover and counts as
 * `OTHER` from both; a title in a sequel chain listing `OTHER` does not.
 *
 * Sequels and prequels are always followed, so a long-running franchise's
 * main path is never cut short by the entries around it; those are reached
 * up to a limit.
 *
 * `crossovers` holds the entries reached only as `OTHER`: they share a
 * universe with the entry but are not part of its story, so they never decide
 * where the franchise starts.
 */
export const franchiseIds = async (
	anilistId: number,
): Promise<{ ids: number[]; crossovers: Set<number> }> => {
	const reached = new Set([anilistId]);
	const outsiders = new Set<number>();
	let around = 0;
	const expand = async (frontier: number[]): Promise<void> => {
		if (frontier.length === 0) {
			return;
		}

		const columns = {
			from: series.anilistId,
			relation: seriesRelated.relation,
			to: seriesRelated.anilistId,
		};
		const [outgoing, incoming] = await Promise.all([
			db
				.select(columns)
				.from(series)
				.innerJoin(seriesRelated, eq(seriesRelated.seriesId, series.id))
				.where(inArray(series.anilistId, frontier)),
			db
				.select(columns)
				.from(seriesRelated)
				.innerJoin(series, eq(series.id, seriesRelated.seriesId))
				.where(inArray(seriesRelated.anilistId, frontier)),
		]);
		const rawEdges = [...outgoing, ...incoming];
		const listers = [
			...new Set(rawEdges.filter(({ relation }) => relation === "OTHER").map(({ from }) => from)),
		];
		const chainedRows =
			listers.length === 0
				? []
				: await db
						.select({
							anilistId: series.anilistId,
						})
						.from(series)
						.innerJoin(seriesRelated, eq(seriesRelated.seriesId, series.id))
						.where(
							and(
								inArray(series.anilistId, listers),
								inArray(seriesRelated.relation, ["SEQUEL", "PREQUEL"]),
							),
						);
		const chained = new Set(chainedRows.map((row) => row.anilistId));
		const crossovers = new Set(
			rawEdges
				.filter(({ relation, from }) => relation === "OTHER" && !chained.has(from))
				.map(({ from, to }) => `${to}>${from}`),
		);
		const edges = rawEdges.map((rawEdge) =>
			crossovers.has(`${rawEdge.from}>${rawEdge.to}`)
				? {
						...rawEdge,
						relation: "OTHER" as const,
					}
				: rawEdge,
		);

		const storyIds = new Set(
			rawEdges.filter(({ relation }) => relation !== "OTHER").flatMap(({ from, to }) => [from, to]),
		);
		const next: number[] = [];
		for (const edge of edges.toSorted(
			(left, right) => rank(left.relation) - rank(right.relation),
		)) {
			const continues = rank(edge.relation) === 0;
			for (const id of [edge.from, edge.to]) {
				if (!reached.has(id) && (continues || around < franchiseLimit)) {
					reached.add(id);
					if (!continues) {
						around += 1;
					}

					if (edge.relation !== "OTHER") {
						next.push(id);
					} else if (!storyIds.has(id)) {
						outsiders.add(id);
					}
				} else if (storyIds.has(id)) {
					outsiders.delete(id);
				}
			}
		}

		await expand(next);
	};
	await expand([anilistId]);

	reached.delete(anilistId);
	return {
		crossovers: outsiders,
		ids: [...reached],
	};
};

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
const franchiseOf = async (row: SeriesRow): Promise<FranchisePart[]> => {
	const { ids, crossovers } = await franchiseIds(row.anilistId);
	const rows = await db.select().from(series).where(inArray(series.anilistId, ids));
	const titles = [
		row,
		...rows.filter(
			(other) =>
				!crossovers.has(other.anilistId) ||
				isNamedAfter(row.title, other.title) ||
				isNamedAfter(other.title, row.title),
		),
	];
	const [cards, relations, ratings] = await Promise.all([
		toSeriesCards(titles, [row.id]),
		db
			.select({
				from: series.anilistId,
				relation: seriesRelated.relation,
				to: seriesRelated.anilistId,
			})
			.from(seriesRelated)
			.innerJoin(series, eq(series.id, seriesRelated.seriesId))
			.where(
				inArray(
					seriesRelated.seriesId,
					titles.map((title) => title.id),
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
					titles.map((title) => title.anilistId),
				),
			),
	]);

	const parts = franchiseParts(
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
							anilistId: title.anilistId,
							episodeCount: card.episode_count,
							format: card.format,
							seriesId: card.id,
							startDate: title.startDate,
							title: card.title,
						},
					]
				: [];
		}),
		relations.flatMap(({ from, to, relation }) => {
			if (relation === "SEQUEL") {
				return [[from, to] as const];
			}
			return relation === "PREQUEL" ? [[to, from] as const] : [];
		}),
		{
			alternatives: relations
				.filter(({ relation }) => relation === "ALTERNATIVE")
				.map(({ from, to }) => [from, to] as const),
			crossovers: [...crossovers],
			currentId: row.anilistId,
			summaries: relations
				.filter(({ relation }) => relation === "SUMMARY" || relation === "COMPILATION")
				.map(({ to }) => to),
		},
	);

	const anilistIdOf = new Map(titles.map((title) => [title.id, title.anilistId]));
	const ratingOf = new Map(ratings.map((rating) => [rating.anilistId, rating]));
	const roles = franchiseRoles(
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
				.filter((part) => part.role === "season")
				.map((part) => defined(anilistIdOf.get(part.series_id))),
		),
	);

	return parts
		.filter((part) => {
			const role = roles.get(defined(anilistIdOf.get(part.series_id)));
			return part.series_id === row.id || (role !== "noise" && role !== "recap");
		})
		.map((part) => ({
			...part,
			card: defined(cards.get(part.series_id)),
			role:
				part.role === "extra" && roles.get(defined(anilistIdOf.get(part.series_id))) === "spin_off"
					? ("spin_off" as const)
					: part.role,
		}));
};

/**
 * The first of a series' awaited episodes (see {@link isEpisodeAwaited})
 * still expected to come out, with when it is expected (see
 * {@link expectedRelease}), or `null` when none is.
 */
const overdueEpisode = async (
	row: SeriesRow,
	now = new Date(),
): Promise<Series["next_episode"]> => {
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
			const expected = episode.airedAt
				? expectedRelease(episode.airedAt, scheduledAt.get(episode.number) ?? null, now)
				: null;
			return expected
				? [
						{
							expected,
							number: episode.number,
						},
					]
				: [];
		})
		.toSorted((left, right) => left.expected.getTime() - right.expected.getTime());

	return first
		? {
				airing_at: first.expected.toISOString(),
				number: first.number,
			}
		: null;
};

/**
 * Loads a title's page: its details and the other titles of its franchise.
 *
 * Reads only the database: titles are laid out when first found, and the
 * scheduler keeps them current.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 */
export const getSeries = async (seriesId: string): Promise<Series> => {
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
		.where(eq(series.id, seriesId))
		.limit(1);
	if (!found) {
		throw new SeriesNotFoundError(seriesId);
	}

	const row = found.series;

	const [anime, cards, franchise, overdue, [indexed]] = await Promise.all([
		getAnime(row.anilistId),
		toSeriesCards([row], [row.id]),
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
		...defined(cards.get(row.id)),
		backdrop_edges: found.edges,
		genres: anime.genres,
		// An aired episode still to come out is next until it is listed, ahead of
		// the one AniList announces after it.
		next_episode:
			overdue ??
			(isNextEpisodeAhead && row.nextEpisodeNumber !== null && row.nextEpisodeAiringAt
				? {
						airing_at: row.nextEpisodeAiringAt.toISOString(),
						number: row.nextEpisodeNumber,
					}
				: null),
		related: franchise.filter((part) => part.role === "extra" || part.role === "spin_off"),
		score_count: indexed?.scoreCount ?? null,
		seasons: current && current.role !== "season" ? [current, ...seasons] : seasons,
		start_date: row.startDate,
		studios: anime.studios,
		tags: anime.tags,
	};
};

/**
 * Checks that a series is stored, for operations that take a series ID but
 * do not read the series itself.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 */
export const assertSeriesExists = async (seriesId: string) => {
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
};

/**
 * A stored series' row.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 */
const loadSeries = async (seriesId: string) => {
	const [row] = await db.select().from(series).where(eq(series.id, seriesId)).limit(1);
	if (!row) {
		throw new SeriesNotFoundError(seriesId);
	}

	return row;
};

/**
 * The episodes before and after one, for moving through a title in order.
 *
 * Only the episodes the title lists count (see {@link isEpisodeShown}), so
 * `next` is never an episode AniKoto does not carry yet. Each is `null` at
 * either end: playing never runs on into another title, such as the next
 * season.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 */
export const getAdjacentEpisodes = async (
	seriesId: string,
	episode: number,
): Promise<{
	previous: number | null;
	next: number | null;
}> => {
	const row = await loadSeries(seriesId);
	const listedByRow = await listedEpisodeDatesOf([row]);
	const listed = listedByRow.get(row.id) ?? [];
	const numbers = listed.map((entry) => entry.number);

	return {
		next: numbers.find((candidate) => candidate > episode) ?? null,
		previous: numbers.findLast((candidate) => candidate < episode) ?? null,
	};
};

/** The episodes each title lists, of several series at once, keyed by series ID. */
export const listedEpisodesOf = async (titles: readonly SeriesRow[]) => {
	const [rows, onAniKoto] = await Promise.all([
		db
			.select()
			.from(seriesEpisode)
			.where(
				inArray(
					seriesEpisode.seriesId,
					titles.map((title) => title.id),
				),
			)
			.orderBy(asc(seriesEpisode.number)),
		loadAniKotoEpisodes(titles.map((title) => title.anilistId)),
	]);

	return keepListed(titles, rows, onAniKoto);
};

const describeEpisodes = async (
	row: SeriesRow,
	episodes: (typeof seriesEpisode.$inferSelect)[],
): Promise<Episode[]> => {
	const first = episodes.at(0);
	const last = episodes.at(-1);
	const [stills, listings] = await Promise.all([
		!first || !last
			? []
			: db
					.select({
						number: seriesEpisode.number,
						stillUrl: effectiveStill,
					})
					.from(seriesEpisode)
					.innerJoin(series, eq(series.id, seriesEpisode.seriesId))
					.where(
						and(
							eq(seriesEpisode.seriesId, row.id),
							gte(seriesEpisode.number, first.number),
							lte(seriesEpisode.number, last.number),
						),
					),
		findEpisodeListings(
			episodes.map((episode) => ({
				anilistId: row.anilistId,
				episode: episode.number,
			})),
		),
	]);
	const stillOf = new Map(stills.map((still) => [still.number, still.stillUrl]));

	return episodes.map((episode) => {
		const listing = listings.get(anilistEpisodeKey(row.anilistId, episode.number));
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
};

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
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 */
export const getSeriesEpisodes = async (seriesId: string): Promise<Episode[]> => {
	const row = await loadSeries(seriesId);
	const listed = await listedEpisodesOf([row]);

	return describeEpisodes(row, listed.get(seriesId) ?? []);
};

/**
 * A slice of {@link getSeriesEpisodes}: `limit` episodes after skipping
 * `offset`, and how many episodes the title lists in all. Only the slice's
 * episodes are looked up for their audio and fillers.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 */
export const getSeriesEpisodePage = async (
	seriesId: string,
	window: {
		offset: number;
		limit: number;
	},
): Promise<{
	episodes: Episode[];
	total: number;
}> => {
	const row = await loadSeries(seriesId);
	const listedBySeries = await listedEpisodesOf([row]);
	const listed = listedBySeries.get(seriesId) ?? [];

	return {
		episodes: await describeEpisodes(
			row,
			listed.slice(window.offset, window.offset + window.limit),
		),
		total: listed.length,
	};
};

/**
 * One episode of a series, as {@link getSeriesEpisodes} lists it.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 * @throws {EpisodeNotFoundError} when the series does not list the episode.
 */
export const getSeriesEpisode = async (seriesId: string, number: number): Promise<Episode> => {
	const episodes = await getSeriesEpisodes(seriesId);
	const episode = episodes.find((candidate) => candidate.number === number);
	if (!episode) {
		throw new EpisodeNotFoundError(seriesId, number);
	}

	return episode;
};

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
const seriesIdsFor = async (
	anilistIds: readonly number[],
	window: {
		wanted: number;
		pageStart: number;
		perPage: number;
	},
) => {
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
		missing,
		seriesIds: found,
	};
};

/** Cards for stored series, in the given order. */
const cardsOf = async (seriesIds: readonly string[]) => {
	const rows = await db
		.select()
		.from(series)
		.where(inArray(series.id, [...seriesIds]));
	const cards = await toSeriesCards(rows);
	return seriesIds.flatMap((id) => cards.get(id) ?? []);
};

/**
 * The titles not stored yet among a page's places, where they are expected
 * on it, described by `describe`. Entries it knows nothing about are left
 * out.
 */
const preparingOn = (
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
): PreparingTitle[] =>
	missing.flatMap(({ anilistId, place }) => {
		const described = describe(anilistId);
		const position = place - pageStart;
		return described?.title && position >= 0 && position < perPage
			? [
					{
						...described,
						anilist_id: anilistId,
						position,
						title: described.title,
					},
				]
			: [];
	});

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
 * @throws {InvalidInputError} when the query fails `BrowseQuerySchema`.
 * @throws {UpstreamUnavailableError} when AniList cannot be browsed
 *   before the index is filled.
 */
export const browseSeries = async (
	query: BrowseQuery,
): Promise<
	Page<SeriesCard> & {
		preparing: PreparingTitle[];
	}
> => {
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
			pageStart,
			perPage,
			wanted: page * perPage + 1,
		});
		const ordered = ranked.flatMap((anilistId) => seriesIds.get(anilistId) ?? []);
		const indexed = new Map(found.map((entry) => [entry.anilistId, entry]));
		return {
			hasNextPage: ordered.length > page * perPage,
			isPreparing: missing.length > 0,
			items: heard(await cardsOf(ordered.slice(pageStart, page * perPage))),
			page,
			perPage,
			preparing: audio
				? []
				: preparingOn(missing, pageStart, perPage, (anilistId) => {
						const entry = indexed.get(anilistId);
						return (
							entry && {
								format: toAnimeFormat(entry.format),
								title: entry.english ?? entry.romaji ?? entry.native,
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
		pageStart: 0,
		perPage: found.perPage,
		wanted: Number.POSITIVE_INFINITY,
	});
	const cards = new Map(found.items.map((anime) => [anime.id, anime]));
	return {
		hasNextPage: found.hasNextPage,
		isPreparing: missing.length > 0,
		items: heard(await cardsOf(anilistIds.flatMap((anilistId) => seriesIds.get(anilistId) ?? []))),
		page: found.page,
		perPage: found.perPage,
		preparing: audio
			? []
			: preparingOn(missing, 0, Number.POSITIVE_INFINITY, (anilistId) => {
					const anime = cards.get(anilistId);
					return (
						anime && {
							format: anime.format,
							title: anime.title.display,
							year: anime.seasonYear,
						}
					);
				}),
	};
};

/** Stored series in release order, the earliest first; those undated last. */
export const byStartDate = (rows: readonly SeriesRow[]) =>
	rows.toSorted(
		(left, right) =>
			(left.startDate ?? "9999").localeCompare(right.startDate ?? "9999") ||
			left.anilistId - right.anilistId,
	);

/** How far back {@link getLatestReleases} looks. */
const releaseWindowMs = 30 * day;

/** Filters and paging for {@link getLatestReleases}. Validate untrusted input with this schema. */
export const ReleasesQuerySchema = BrowseQuerySchema.pick({
	audio: true,
	format: true,
	page: true,
	perPage: true,
});

export type ReleasesQuery = z.input<typeof ReleasesQuerySchema>;

const relativeTime = new Intl.RelativeTimeFormat("en", {
	numeric: "always",
});

/** How long ago a release came out, in words, and the stretch of time it falls in. */
const releaseAge = (releasedAt: string, now: number): Pick<Release, "released_ago" | "period"> => {
	const age = Math.max(0, now - Date.parse(releasedAt));
	const minutes = Math.floor(age / minute);
	const hours = Math.floor(age / hour);
	let period: Release["period"] = "Earlier";
	if (age < day) {
		period = "Last 24 hours";
	} else if (age < 7 * day) {
		period = "This past week";
	}
	let releasedAgo = relativeTime.format(-Math.floor(age / day), "day");
	if (minutes < 60) {
		releasedAgo = relativeTime.format(-Math.max(1, minutes), "minute");
	} else if (hours < 24) {
		releasedAgo = relativeTime.format(-hours, "hour");
	}

	return {
		period,
		released_ago: releasedAgo,
	};
};

/**
 * The titles with an episode out in the last 30 days, each with its latest
 * episode that can be watched, the latest first.
 *
 * An episode counts once its title lists it (see {@link isEpisodeShown}),
 * so an episode that has aired but that AniKoto does not carry yet is left
 * out until it does. `format` and `audio` apply to the title's AniList
 * entry. Reads only the database.
 *
 * @throws {InvalidInputError} when the query fails {@link ReleasesQuerySchema}.
 */
export const getLatestReleases = async (
	query: ReleasesQuery,
	now = new Date(),
): Promise<Page<Release>> => {
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
							seriesId: seriesEpisode.seriesId,
						})
						.from(seriesEpisode)
						.where(releasedBetween(since, now)),
				),
			),
		);
	const listed = await listedEpisodeDatesOf(rows);

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
					anilistId: row.anilistId,
					episode: episode.number,
					releasedAt: at.toISOString(),
					seriesId: row.id,
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
		hasNextPage: matching.length > page * perPage,
		isPreparing: false,
		items: shown.flatMap(({ seriesId, episode, releasedAt }) => {
			const card = cards.get(seriesId);
			return card
				? [
						{
							episode,
							released_at: releasedAt,
							series: card,
							...releaseAge(releasedAt, now.getTime()),
						},
					]
				: [];
		}),
		page,
		perPage,
	};
};
