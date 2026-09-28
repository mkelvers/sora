import { and, eq, inArray } from "drizzle-orm";

import { db } from "../database/client";
import { seriesEpisode, seriesSeason } from "../database/schema";
import { EpisodeNotFoundError, SeasonNotFoundError } from "../errors";
import { getStoredUnits } from "../playback/episodes/episodes";
import { aniKoto } from "../playback/providers/registry";
import type { SeasonKind } from "./seasons";
import type { SeriesKind } from "./series";

/**
 * A season episode together with the AniList episode that plays it.
 *
 * Clients address episodes by season and number; playback, progress, and
 * provider matching are keyed by AniList entry and episode, which survive a
 * series being laid out again.
 */
export interface LocatedEpisode {
	seriesId: string;
	seasonId: string;
	/** Position within the season, from 1. */
	number: number;
	anilistId: number;
	anilistEpisode: number;
}

/** Where an AniList episode sits in its series. */
export interface SeasonEpisodeRef {
	seriesId: string;
	seasonId: string;
	number: number;
}

/**
 * Finds the AniList episode that plays a season episode.
 *
 * @param seriesId - The series the season is addressed under, when it is;
 *   a season of another series is then not found.
 * @throws {@link SeasonNotFoundError} when the season does not exist, or
 *   does not belong to `seriesId`.
 * @throws {@link EpisodeNotFoundError} when the season has no such episode,
 *   or it is an extra only TMDB lists, which nothing streams.
 */
export async function locateEpisode(
	seasonId: string,
	number: number,
	seriesId?: string,
): Promise<LocatedEpisode> {
	const [row] = await db
		.select({
			seriesId: seriesSeason.seriesId,
			anilistId: seriesEpisode.anilistId,
			anilistEpisode: seriesEpisode.anilistEpisode,
		})
		.from(seriesSeason)
		.leftJoin(
			seriesEpisode,
			and(eq(seriesEpisode.seasonId, seriesSeason.id), eq(seriesEpisode.number, number)),
		)
		.where(eq(seriesSeason.id, seasonId))
		.limit(1);

	if (!row || (seriesId !== undefined && row.seriesId !== seriesId)) {
		throw new SeasonNotFoundError(seasonId);
	}

	if (row.anilistId === null || row.anilistEpisode === null) {
		throw new EpisodeNotFoundError(seasonId, number);
	}

	return {
		seriesId: row.seriesId,
		seasonId,
		number,
		anilistId: row.anilistId,
		anilistEpisode: row.anilistEpisode,
	};
}

/**
 * Finds where AniList episodes sit in their stored series.
 *
 * Episodes of entries no stored series contains are left out.
 *
 * @param options.placeUnlisted - Also place episodes the layout does not
 *   list yet. While AniList does not know an entry's episode count, its
 *   season lists only aired episodes; an upcoming one is placed right after
 *   the entry's latest listed episode.
 * @returns Positions keyed by {@link anilistEpisodeKey}.
 */
export async function findSeasonEpisodes(
	episodes: readonly {
		anilistId: number;
		episode: number;
	}[],
	options: {
		placeUnlisted: boolean;
	},
): Promise<Map<string, SeasonEpisodeRef>> {
	const found = new Map<string, SeasonEpisodeRef>();
	if (episodes.length === 0) {
		return found;
	}

	const rows = await db
		.select({
			seriesId: seriesSeason.seriesId,
			seasonId: seriesEpisode.seasonId,
			number: seriesEpisode.number,
			anilistId: seriesEpisode.anilistId,
			anilistEpisode: seriesEpisode.anilistEpisode,
		})
		.from(seriesEpisode)
		.innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
		.where(
			inArray(seriesEpisode.anilistId, [...new Set(episodes.map((episode) => episode.anilistId))]),
		);

	const listed = new Map<string, SeasonEpisodeRef>();
	const latest = new Map<
		number,
		{
			anilistEpisode: number;
			ref: SeasonEpisodeRef;
		}
	>();
	for (const row of rows) {
		if (row.anilistId === null || row.anilistEpisode === null) {
			continue;
		}

		const ref = {
			seriesId: row.seriesId,
			seasonId: row.seasonId,
			number: row.number,
		};
		listed.set(anilistEpisodeKey(row.anilistId, row.anilistEpisode), ref);

		const previous = latest.get(row.anilistId);
		if (!previous || row.anilistEpisode > previous.anilistEpisode) {
			latest.set(row.anilistId, {
				anilistEpisode: row.anilistEpisode,
				ref,
			});
		}
	}

	for (const { anilistId, episode } of episodes) {
		const key = anilistEpisodeKey(anilistId, episode);
		const exact = listed.get(key);
		const last = latest.get(anilistId);
		if (exact) {
			found.set(key, exact);
		} else if (options.placeUnlisted && last && episode > last.anilistEpisode) {
			found.set(key, {
				...last.ref,
				number: last.ref.number + (episode - last.anilistEpisode),
			});
		}
	}

	return found;
}

/** The key {@link findSeasonEpisodes} files an AniList episode under. */
export function anilistEpisodeKey(anilistId: number, episode: number) {
	return `${anilistId}:${episode}`;
}

/** What {@link isEpisodeReleased} needs to know about a title. */
export interface ReleaseSchedule {
	nextEpisodeSeasonId: string | null;
	nextEpisodeNumber: number | null;
	nextEpisodeAiringAt: Date | null;
}

/**
 * Whether an episode has been released: it is not at or past the title's
 * announced next episode, and has aired. When it aired is AniList's airing
 * time when known, and otherwise TMDB's air date.
 */
export function isEpisodeReleased(
	title: ReleaseSchedule,
	episode: {
		seasonId: string;
		number: number;
		/** `YYYY-MM-DD`. */
		airDate: string | null;
		airedAt: Date | null;
	},
	now = new Date(),
) {
	const isAtOrAfterNext =
		title.nextEpisodeAiringAt !== null &&
		title.nextEpisodeAiringAt > now &&
		episode.seasonId === title.nextEpisodeSeasonId &&
		title.nextEpisodeNumber !== null &&
		episode.number >= title.nextEpisodeNumber;
	const hasAired = episode.airedAt
		? episode.airedAt <= now
		: episode.airDate === null || episode.airDate <= now.toISOString().slice(0, 10);

	return !isAtOrAfterNext && hasAired;
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
	const stored = (await getStoredUnits(anilistIds)).filter(
		(entry) => entry.provider === aniKoto.id,
	);
	return {
		carried: new Set(
			stored.flatMap((entry) =>
				entry.units.map((unit) => anilistEpisodeKey(entry.anilistId, unit.number)),
			),
		),
		lookedUp: new Set(stored.map((entry) => entry.anilistId)),
	};
}

/** What {@link isEpisodeAvailable} and {@link isEpisodeShown} need to know about an episode. */
export interface EpisodeListingRow {
	seasonId: string;
	number: number;
	anilistId: number | null;
	anilistEpisode: number | null;
	/** `YYYY-MM-DD`. */
	airDate: string | null;
	airedAt: Date | null;
	tmdbEpisodeNumber: number | null;
}

/**
 * Whether an episode can be watched: AniKoto, the source of truth for which
 * episodes exist, carries it. An extra only TMDB lists never can.
 *
 * Until AniKoto has been looked up for the entry, the episode counts as
 * available once {@link isEpisodeReleased} says it has been released.
 */
export function isEpisodeAvailable(
	title: ReleaseSchedule,
	episode: EpisodeListingRow,
	onAniKoto: AniKotoEpisodes,
	now = new Date(),
) {
	if (episode.anilistId === null || episode.anilistEpisode === null) {
		return false;
	}

	return onAniKoto.lookedUp.has(episode.anilistId)
		? onAniKoto.carried.has(anilistEpisodeKey(episode.anilistId, episode.anilistEpisode))
		: isEpisodeReleased(title, episode, now);
}

/**
 * Whether a season lists an episode: it is available (see
 * {@link isEpisodeAvailable}) and has its details. An extra only TMDB lists
 * is always listed.
 *
 * An episode of a title TMDB lists has its details once TMDB lists the
 * episode; until then the scheduler lays the title out again to look for
 * them (see `refreshEpisodeDetails`). A film has the details of the film
 * itself, and a title TMDB does not list has only what AniList knows.
 */
export function isEpisodeShown(
	title: ReleaseSchedule & {
		kind: SeriesKind;
	},
	season: {
		kind: SeasonKind;
	},
	episode: EpisodeListingRow,
	onAniKoto: AniKotoEpisodes,
	now = new Date(),
) {
	if (episode.anilistId === null) {
		return true;
	}

	const hasDetails =
		episode.tmdbEpisodeNumber !== null || season.kind === "movie" || title.kind !== "tv";
	return hasDetails && isEpisodeAvailable(title, episode, onAniKoto, now);
}
