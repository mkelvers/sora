import { and, eq, sql } from "drizzle-orm";

import { db } from "../database/client";
import {
	anikotoSeries,
	animeSearch,
	providerMapping,
	series,
	seriesEpisode,
} from "../database/schema";
import { EpisodeNotFoundError, SeriesNotFoundError } from "../errors";
import { getStoredUnits } from "../playback/episodes/episodes";
import { aniKoto } from "../playback/providers/registry";
import { hour } from "../time";
import type { SeriesKind } from "./series";

/**
 * An episode of a series together with the AniList entry it belongs to.
 *
 * Clients address episodes by series and number; provider matching is keyed
 * by AniList entry and episode. An episode's number is the same in both.
 */
export interface LocatedEpisode {
	seriesId: string;
	/** The episode's number in the series, from 1. */
	number: number;
	anilistId: number;
}

/**
 * Finds the AniList entry an episode of a series belongs to.
 *
 * @throws {@link SeriesNotFoundError} when the ID does not identify a series.
 * @throws {@link EpisodeNotFoundError} when the series has no such episode.
 */
export async function locateEpisode(seriesId: string, number: number): Promise<LocatedEpisode> {
	const [row] = await db
		.select({
			anilistId: series.anilistId,
			number: seriesEpisode.number,
		})
		.from(series)
		.leftJoin(
			seriesEpisode,
			and(eq(seriesEpisode.seriesId, series.id), eq(seriesEpisode.number, number)),
		)
		.where(eq(series.id, seriesId))
		.limit(1);

	if (!row) {
		throw new SeriesNotFoundError(seriesId);
	}

	if (row.number === null) {
		throw new EpisodeNotFoundError(seriesId, number);
	}

	return {
		seriesId,
		number,
		anilistId: row.anilistId,
	};
}

/**
 * Whether AniKoto, which decides what can be watched, carries an index
 * entry: its catalogue names the entry, or the entry was matched to it.
 */
export const carriedByAniKoto = sql`(exists (select 1 from ${anikotoSeries} where ${anikotoSeries.anilistId} = ${animeSearch.anilistId}) or exists (select 1 from ${providerMapping} where ${providerMapping.provider} = ${aniKoto.id} and ${providerMapping.providerMediaId} is not null and ${providerMapping.anilistId} = ${animeSearch.anilistId}))`;

/** The key an AniList episode is filed under, such as in {@link AniKotoEpisodes}. */
export function anilistEpisodeKey(anilistId: number, episode: number) {
	return `${anilistId}:${episode}`;
}

/** What {@link isEpisodeReleased} needs to know about a series. */
export interface ReleaseSchedule {
	nextEpisodeNumber: number | null;
	nextEpisodeAiringAt: Date | null;
}

/** What {@link isEpisodeAvailable} and {@link isEpisodeShown} need to know about an episode. */
export interface EpisodeListingRow {
	number: number;
	/** `YYYY-MM-DD`. */
	airDate: string | null;
	airedAt: Date | null;
	tmdbEpisodeNumber: number | null;
}

/**
 * When an episode came out, in a query: when it aired, or the start of its
 * air date when AniList has no airing time. See {@link releasedAtOf} for an
 * episode already loaded.
 */
export const episodeReleasedAt = sql<Date>`coalesce(${seriesEpisode.airedAt}, (${seriesEpisode.airDate} || 'T00:00:00Z')::timestamptz)`;

/**
 * When an episode came out, as {@link episodeReleasedAt} says, or `null`
 * when it has neither an airing time nor an air date.
 */
export function releasedAtOf(episode: Pick<EpisodeListingRow, "airDate" | "airedAt">) {
	return (
		episode.airedAt ?? (episode.airDate === null ? null : new Date(`${episode.airDate}T00:00:00Z`))
	);
}

/**
 * Whether an episode has been released: it is not at or past the series'
 * announced next episode, and has aired (see {@link releasedAtOf}); one with
 * no date at all counts as aired.
 */
export function isEpisodeReleased(
	title: ReleaseSchedule,
	episode: Pick<EpisodeListingRow, "number" | "airDate" | "airedAt">,
	now = new Date(),
) {
	const isAtOrAfterNext =
		title.nextEpisodeAiringAt !== null &&
		title.nextEpisodeAiringAt > now &&
		title.nextEpisodeNumber !== null &&
		episode.number >= title.nextEpisodeNumber;
	const releasedAt = releasedAtOf(episode);

	return !isAtOrAfterNext && (releasedAt === null || releasedAt <= now);
}

/** The episodes AniKoto's stored lists carry; see {@link loadAniKotoEpisodes}. */
export interface AniKotoEpisodes {
	/** Keyed by {@link anilistEpisodeKey}. */
	carried: ReadonlySet<string>;
	/** The AniList entries AniKoto has been looked up for, whether it carries them or not. */
	lookedUp: ReadonlySet<number>;
}

/**
 * Reads which episodes of the given AniList entries AniKoto carries, from
 * its stored episode lists, without asking AniKoto.
 */
export async function loadAniKotoEpisodes(anilistIds: readonly number[]): Promise<AniKotoEpisodes> {
	const storedUnits = await getStoredUnits(anilistIds);
	const stored = storedUnits.filter((entry) => entry.provider === aniKoto.id);
	return {
		carried: new Set(
			stored.flatMap((entry) =>
				entry.units.map((unit) => anilistEpisodeKey(entry.anilistId, unit.number)),
			),
		),
		lookedUp: new Set(stored.map((entry) => entry.anilistId)),
	};
}

/**
 * AniKoto's highest playable episode number, or null until it carries numbered
 * episodes. Matching and stored layouts use this before AniList's broadcast count.
 */
export async function getAniKotoEpisodeCount(anilistId: number): Promise<number | null> {
	const stored = await getStoredUnits([anilistId]);
	const numbers = stored
		.filter((entry) => entry.provider === aniKoto.id)
		.flatMap((entry) => entry.units.map((unit) => unit.number))
		.filter((number) => Number.isInteger(number) && number > 0);
	return numbers.length > 0 ? Math.max(...numbers) : null;
}

/**
 * Whether an episode can be watched: AniKoto, the source of truth for which
 * episodes exist, carries it.
 *
 * Until AniKoto has been looked up for the series' entry, the episode counts
 * as available once {@link isEpisodeReleased} says it has been released.
 */
export function isEpisodeAvailable(
	title: ReleaseSchedule & {
		anilistId: number;
	},
	episode: EpisodeListingRow,
	onAniKoto: AniKotoEpisodes,
	now = new Date(),
) {
	return onAniKoto.lookedUp.has(title.anilistId)
		? onAniKoto.carried.has(anilistEpisodeKey(title.anilistId, episode.number))
		: isEpisodeReleased(title, episode, now);
}

/**
 * Whether a series lists an episode: it is available (see
 * {@link isEpisodeAvailable}) and has its details.
 *
 * An episode of an entry TMDB lists in a show has its details once TMDB
 * lists the episode; until then the scheduler lays the series out again to
 * look for them (see `refreshEpisodeListings`). A film has the details of
 * the film itself, and an entry TMDB does not list has only what AniList
 * knows.
 */
export function isEpisodeShown(
	title: ReleaseSchedule & {
		anilistId: number;
		kind: SeriesKind;
	},
	episode: EpisodeListingRow,
	onAniKoto: AniKotoEpisodes,
	now = new Date(),
) {
	const hasDetails = episode.tmdbEpisodeNumber !== null || title.kind !== "tv";
	return hasDetails && isEpisodeAvailable(title, episode, onAniKoto, now);
}

/**
 * How long after an episode is expected it is still waited for. AniKoto has
 * most subs within about an hour of when they are expected, and those of
 * long-running shows hours later; one it does not have by then stops
 * counting as coming.
 */
const releaseGraceMs = 12 * hour;

/**
 * Whether an episode has aired but is still to come out: AniList says it
 * aired, the series does not list it yet (see {@link isEpisodeShown}), and
 * it is the one AniKoto gets next, being the first or following an episode
 * AniKoto carries.
 *
 * That last part leaves out an episode AniKoto skipped while carrying later
 * ones, and the episodes of an entry it has never carried any of. How long
 * the episode stays awaited is up to {@link expectedRelease}.
 */
export function isEpisodeAwaited(
	title: ReleaseSchedule & {
		anilistId: number;
		kind: SeriesKind;
	},
	episode: EpisodeListingRow,
	onAniKoto: AniKotoEpisodes,
	now = new Date(),
) {
	if (episode.airedAt === null) {
		return false;
	}

	const isNextOnAniKoto =
		episode.number === 1 ||
		onAniKoto.carried.has(anilistEpisodeKey(title.anilistId, episode.number - 1));

	return (
		episode.airedAt <= now && isNextOnAniKoto && !isEpisodeShown(title, episode, onAniKoto, now)
	);
}

/**
 * When an awaited episode (see {@link isEpisodeAwaited}) is expected to
 * come out: the later of AniList's broadcast time and AnimeSchedule's time
 * for it, which is its subbed stream where there is one and its broadcast
 * otherwise. AnimeSchedule's is later for a stream that follows the
 * broadcast, and for an episode that was put off.
 *
 * @param scheduledAt - AnimeSchedule's time, or `null` when its timetable
 *   does not have the episode.
 * @returns `null` once that time is more than 12 hours ago: the episode did
 *   not come out around when it was expected, and no longer counts as coming.
 */
export function expectedRelease(airedAt: Date, scheduledAt: Date | null, now = new Date()) {
	const expected = scheduledAt && scheduledAt > airedAt ? scheduledAt : airedAt;
	return now.getTime() < expected.getTime() + releaseGraceMs ? expected : null;
}
