import { and, eq, inArray, not, sql } from "drizzle-orm";

import type { MediaFormat, MediaStatus } from "../anilist/graphql.generated";
import { fuzzyDate } from "../catalog/models/text";
import { db } from "../database/client";
import { anime, animeSearch, series } from "../database/schema";
import type { UpcomingSeries } from "../models/series";
import { day } from "../time";
import { byStartDate, franchiseIds, toSeriesCards } from "./queries";

/** How far ahead a start counts as soon. */
const soonMs = 30 * day;

/** Titles listed of each kind: a row to take in at a glance, not a catalogue. */
const upcomingLimit = 12;

/** The statuses of a title that is out. */
const released: MediaStatus[] = ["FINISHED", "RELEASING"];

/** What a franchise starts with: a show or a film, rather than a special or an OVA. */
const openingFormats: MediaFormat[] = ["TV", "ONA", "MOVIE"];

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
 * Lists the titles starting soon (see {@link startsSoon}), whatever they
 * are: a season, a film, or an OVA.
 *
 * A title is returning when its franchise has something out already; the
 * franchise's earliest show or film that is out is listed in its place,
 * since that is where catching up starts. Each title is listed once, with the
 * soonest start of its franchise.
 *
 * Returning titles come first, then new titles, each kind the most
 * anticipated first and at most {@link upcomingLimit}. Adult media is never
 * listed. Reads only the database, so only stored titles are listed; the
 * scheduler stores this season's and the next's ahead of time.
 */
export async function getUpcomingSeries(now = new Date()): Promise<UpcomingSeries[]> {
	const unreleased = await db
		.select({
			series,
			startDate: sql<{
				year: number | null;
				month: number | null;
				day: number | null;
			} | null>`${anime.media}->'startDate'`,
			popularity: animeSearch.popularity,
		})
		.from(series)
		.innerJoin(anime, eq(anime.anilistId, series.anilistId))
		.innerJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
		.where(and(eq(anime.status, "NOT_YET_RELEASED"), not(animeSearch.isAdult)));

	const listed = new Map<
		string,
		{
			row: typeof series.$inferSelect;
			startDate: string;
			popularity: number;
			returning: boolean;
		}
	>();
	for (const entry of unreleased) {
		const startDate = entry.startDate ? fuzzyDate(entry.startDate) : null;
		if (!startsSoon(startDate, now)) {
			continue;
		}

		const caughtUpOn = await earliestReleased(entry.series.anilistId);
		const row = caughtUpOn ?? entry.series;
		const known = listed.get(row.id);
		listed.set(row.id, {
			row,
			startDate: known && known.startDate < startDate ? known.startDate : startDate,
			popularity: Math.max(entry.popularity, known?.popularity ?? 0),
			returning: caughtUpOn !== null,
		});
	}

	const picked = [true, false].flatMap((isReturning) =>
		[...listed.values()]
			.filter((title) => title.returning === isReturning)
			.toSorted((left, right) => right.popularity - left.popularity)
			.slice(0, upcomingLimit),
	);
	const cards = await toSeriesCards(picked.map((title) => title.row));

	return picked.flatMap((title) => {
		const card = cards.get(title.row.id);
		return card
			? [
					{
						series: card,
						start_date: title.startDate,
						returning: title.returning,
					},
				]
			: [];
	});
}

/**
 * The title of an entry's franchise to start catching up on: the earliest
 * show or film that is out, or the earliest of anything out when none is.
 * `null` when nothing of the franchise is out.
 */
async function earliestReleased(anilistId: number) {
	const franchise = await franchiseIds(anilistId);
	const rows =
		franchise.length > 0
			? await db
					.select({
						series,
						format: animeSearch.format,
					})
					.from(series)
					.leftJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
					.where(and(inArray(series.anilistId, franchise), inArray(series.status, released)))
			: [];
	const opening = rows.filter((row) => row.format !== null && openingFormats.includes(row.format));
	const [earliest] = byStartDate((opening.length > 0 ? opening : rows).map((row) => row.series));
	return earliest ?? null;
}
