import { day } from "@sora/shared";
import { and, eq, not, sql } from "drizzle-orm";

import { fuzzyDate } from "../catalog/models/text";
import { catalogSeriesAllowed } from "../catalog/visibility";
import { db } from "../database/client";
import { anime, animeSearch } from "../database/schema/catalog";
import { series } from "../database/schema/series";
import type { UpcomingSeries } from "../models/series";
import { CatchUp } from "./catch-up";
import { toCards } from "./queries";

/**
 * Whether a start date is soon: its day is known, and it falls from today
 * to {@link soonMs} ahead. A start only announced, or known to the month or
 * year alone, is never soon.
 *
 * @param startDate - `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, as `fuzzyDate` formats it.
 */
export const startsSoon = (startDate: string | null, now: Date): startDate is string => {
	/** How far ahead a start counts as soon. */
	const soonMs = 30 * day;

	if (startDate?.length !== 10) {
		return false;
	}

	const today = now.toISOString().slice(0, 10);
	const until = new Date(now.getTime() + soonMs).toISOString().slice(0, 10);

	return startDate >= today && startDate <= until;
};

export const upcoming = {
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
	 * anticipated first and at most 12. Adult media is never
	 * listed. Reads only the database, so only stored titles are listed; the
	 * scheduler stores this season's and the next's ahead of time.
	 */
	async list(now = new Date()): Promise<UpcomingSeries[]> {
		/** Titles listed of each kind: a row to take in at a glance, not a catalogue. */
		const limit = 12;

		const unreleased = await db
			.select({
				popularity: animeSearch.popularity,
				series,
				startDate: sql<{
					year: number | null;
					month: number | null;
					day: number | null;
				} | null>`${anime.media}->'startDate'`,
			})
			.from(series)
			.innerJoin(anime, eq(anime.anilistId, series.anilistId))
			.innerJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
			.where(
				and(eq(anime.status, "NOT_YET_RELEASED"), not(animeSearch.isAdult), catalogSeriesAllowed),
			);

		const listed = new Map<
			string,
			{
				row: typeof series.$inferSelect;
				startDate: string;
				popularity: number;
				returning: boolean;
			}
		>();

		const soon = unreleased.flatMap((entry) => {
			let startDate: string | null = null;

			if (entry.startDate) {
				startDate = fuzzyDate(entry.startDate);
			}

			if (startsSoon(startDate, now)) {
				return [
					{
						entry,
						startDate,
					},
				];
			}

			return [];
		});

		const caughtUp = await Promise.all(
			soon.map(({ entry }) => new CatchUp(entry.series.anilistId).start()),
		);

		for (const [index, { entry, startDate }] of soon.entries()) {
			const caughtUpOn = caughtUp[index] ?? null;
			const row = caughtUpOn ?? entry.series;
			const known = listed.get(row.id);
			let earliest = startDate;

			if (known && known.startDate < startDate) {
				earliest = known.startDate;
			}

			listed.set(row.id, {
				popularity: Math.max(entry.popularity, known?.popularity ?? 0),
				returning: caughtUpOn !== null,
				row,
				startDate: earliest,
			});
		}

		const picked = [true, false].flatMap((isReturning) =>
			[...listed.values()]
				.filter((title) => title.returning === isReturning)
				.toSorted((left, right) => right.popularity - left.popularity)
				.slice(0, limit),
		);

		const cards = await toCards(picked.map((title) => title.row));

		return picked.flatMap((title) => {
			const card = cards.get(title.row.id);

			if (card) {
				return [
					{
						returning: title.returning,
						series: card,
						start_date: title.startDate,
					},
				];
			}

			return [];
		});
	},
};
