import { and, asc, eq, inArray, not, sql } from "drizzle-orm";

import type { MediaStatus } from "../anilist/graphql.generated";
import { fuzzyDate } from "../catalog/models/text";
import { db } from "../database/client";
import { anime, animeSearch, series, seriesEntry, seriesRelated } from "../database/schema";
import { day } from "../time";
import type { SeriesCard } from "./models";
import { toSeriesCards } from "./queries";

/** How far ahead a start counts as soon. */
const soonMs = 30 * day;

/** Titles listed of each kind: a row to take in at a glance, not a catalogue. */
const upcomingLimit = 12;

/** The statuses of an entry that is out. */
const released: MediaStatus[] = ["FINISHED", "RELEASING"];

/** A title with something starting soon. */
export interface UpcomingSeries {
	series: SeriesCard;
	/** When it starts, as `YYYY-MM-DD`. */
	startDate: string;
	/**
	 * Whether the title already has something out, so what starts is a new
	 * season, film, or OVA of it, or of a title related to it, rather than a
	 * new title.
	 */
	returning: boolean;
}

/**
 * Whether a start date is soon: its day is known, and it falls from today
 * to {@link soonMs} ahead. A start only announced, or known to the month or
 * year alone, is never soon.
 *
 * @param startDate - `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, as `fuzzyDate` formats it.
 */
export function startsSoon(startDate: string | null, now: Date): startDate is string {
	if (startDate?.length !== 10) {
		return false;
	}

	const today = now.toISOString().slice(0, 10);
	const until = new Date(now.getTime() + soonMs).toISOString().slice(0, 10);
	return startDate >= today && startDate <= until;
}

/**
 * Lists the titles with something starting soon (see {@link startsSoon}),
 * whatever it is: a season, a film, or an OVA.
 *
 * A title is returning when it has something out already. So is a title
 * with nothing out that is related to one that has, such as a sequel TMDB
 * lists as a show of its own: the title already out is listed in its
 * place, since that is the one to catch up on. Each title is listed once.
 *
 * Returning titles come first, then new titles, each kind the most
 * anticipated first and at most {@link upcomingLimit}. Adult media is never
 * listed. Reads only the database, so only stored titles are listed; the
 * scheduler stores this season's and the next's ahead of time.
 */
export async function getUpcomingSeries(now = new Date()): Promise<UpcomingSeries[]> {
	const entries = await db
		.select({
			seriesId: seriesEntry.seriesId,
			startDate: sql<{
				year: number | null;
				month: number | null;
				day: number | null;
			} | null>`${anime.media}->'startDate'`,
			popularity: animeSearch.popularity,
		})
		.from(seriesEntry)
		.innerJoin(anime, eq(anime.anilistId, seriesEntry.anilistId))
		.innerJoin(animeSearch, eq(animeSearch.anilistId, seriesEntry.anilistId))
		.where(and(eq(anime.status, "NOT_YET_RELEASED"), not(animeSearch.isAdult)));

	const starting = entries.flatMap((entry) => {
		const startDate = entry.startDate ? fuzzyDate(entry.startDate) : null;
		return startsSoon(startDate, now)
			? [
					{
						seriesId: entry.seriesId,
						startDate,
						popularity: entry.popularity,
					},
				]
			: [];
	});
	if (starting.length === 0) {
		return [];
	}

	const seriesIds = [...new Set(starting.map((entry) => entry.seriesId))];
	const out = await releasedSeries(seriesIds);
	const caughtUpOn = await releasedRelatives(seriesIds.filter((seriesId) => !out.has(seriesId)));

	const listed = new Map<
		string,
		{
			startDate: string;
			popularity: number;
			returning: boolean;
		}
	>();
	for (const entry of starting) {
		const seriesId = caughtUpOn.get(entry.seriesId) ?? entry.seriesId;
		const known = listed.get(seriesId);
		listed.set(seriesId, {
			startDate: known && known.startDate < entry.startDate ? known.startDate : entry.startDate,
			popularity: Math.max(entry.popularity, known?.popularity ?? 0),
			returning: out.has(entry.seriesId) || caughtUpOn.has(entry.seriesId),
		});
	}

	const picked = [true, false].flatMap((isReturning) =>
		[...listed]
			.filter(([, title]) => title.returning === isReturning)
			.toSorted(([, left], [, right]) => right.popularity - left.popularity)
			.slice(0, upcomingLimit),
	);
	const cards = await toSeriesCards(
		await db
			.select()
			.from(series)
			.where(
				inArray(
					series.id,
					picked.map(([seriesId]) => seriesId),
				),
			),
	);

	return picked.flatMap(([seriesId, title]) => {
		const card = cards.get(seriesId);
		return card
			? [
					{
						series: card,
						startDate: title.startDate,
						returning: title.returning,
					},
				]
			: [];
	});
}

/** Which of the given titles have something out: an entry airing or finished. */
async function releasedSeries(seriesIds: readonly string[]): Promise<Set<string>> {
	if (seriesIds.length === 0) {
		return new Set();
	}

	const rows = await db
		.selectDistinct({
			seriesId: seriesEntry.seriesId,
		})
		.from(seriesEntry)
		.innerJoin(anime, eq(anime.anilistId, seriesEntry.anilistId))
		.where(and(inArray(seriesEntry.seriesId, [...seriesIds]), inArray(anime.status, released)));
	return new Set(rows.map((row) => row.seriesId));
}

/**
 * For each of the given titles, the first of its related titles that has
 * something out, by series ID. Titles with no such relative are left out.
 */
async function releasedRelatives(seriesIds: readonly string[]): Promise<Map<string, string>> {
	if (seriesIds.length === 0) {
		return new Map();
	}

	const rows = await db
		.selectDistinct({
			seriesId: seriesRelated.seriesId,
			relatedId: seriesEntry.seriesId,
			position: seriesRelated.position,
		})
		.from(seriesRelated)
		.innerJoin(seriesEntry, eq(seriesEntry.anilistId, seriesRelated.anilistId))
		.innerJoin(anime, eq(anime.anilistId, seriesEntry.anilistId))
		.where(and(inArray(seriesRelated.seriesId, [...seriesIds]), inArray(anime.status, released)))
		.orderBy(asc(seriesRelated.position));

	const relatives = new Map<string, string>();
	for (const row of rows) {
		if (row.relatedId !== row.seriesId && !relatives.has(row.seriesId)) {
			relatives.set(row.seriesId, row.relatedId);
		}
	}

	return relatives;
}
