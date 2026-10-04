import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch, featuredPick, series, seriesState } from "../../database/schema";
import type { SeriesCard } from "../../models/series";
import { scheduleSeriesStore } from "../../scheduler/queue";
import { effectiveBackdrop, effectiveLogo } from "../../series/edges";
import { toSeriesCards } from "../../series/queries";
import {
	arrange,
	dateBefore,
	featuredPattern,
	longRunningAfter,
	rotate,
	rotationOf,
	shelfOf,
	shelfThresholds,
	type FeaturedShelf,
} from "./rotation";

/** Formats worth featuring: shows and films, not music videos, specials, or OVAs. */
const featuredFormats = ["TV", "ONA", "MOVIE"] as const;

/** Titles not stored yet that one pick queues for the scheduler, the most popular first. */
const backfillPerPick = 20;

/** The weakest an entry may be and still put its title on some shelf. */
const lowestThreshold = {
	score: Math.min(...Object.values(shelfThresholds).map((threshold) => threshold.score)),
	popularity: Math.min(...Object.values(shelfThresholds).map((threshold) => threshold.popularity)),
};

/**
 * Titles to feature on a profile's home page: new seasons and films that are
 * well liked, the best rated, and popular hits, mostly new ones (see
 * {@link featuredPattern}). The seasons of one show share its backdrop and
 * logo, so a show is featured through one of them: a new season as itself,
 * and a show that is acclaimed or popular through its earliest such season.
 *
 * They are picked once a week, on Monday morning (see `rotationStart`), in
 * each profile's own order, and kept for the week: a title that can no
 * longer be shown gives its place to another, as does one the profile
 * dropped from its watchlist. No title is featured two
 * weeks in a row.
 *
 * Reads only the database: candidates come from the search index.
 * Long-running titles such as Detective Conan are left out, as are those
 * without a backdrop and logo to draw, and those nothing streams. Candidates not stored yet are queued for the
 * scheduler, a few with each pick, so later picks find them.
 */
export async function getFeatured(userId: string, now = new Date()): Promise<SeriesCard[]> {
	const rotation = rotationOf(now);
	const picks = await db
		.select()
		.from(featuredPick)
		.where(
			and(
				eq(featuredPick.userId, userId),
				inArray(featuredPick.rotation, [rotation - 1, rotation]),
			),
		)
		.orderBy(asc(featuredPick.position));

	const dropped = await db
		.select({
			seriesId: seriesState.seriesId,
		})
		.from(seriesState)
		.where(and(eq(seriesState.userId, userId), eq(seriesState.status, "dropped")));
	const unwanted = new Set(dropped.map((row) => row.seriesId));

	const current = picks.filter((pick) => pick.rotation === rotation);
	const kept = current.map((pick) => pick.seriesId);
	const keptCards = await cardsOf(kept);
	const shown = kept.filter((id) => !unwanted.has(id) && isShowable(keptCards.get(id)));
	const wanted = featuredPattern.length - shown.length;
	if (wanted <= 0) {
		return shown.slice(0, featuredPattern.length).flatMap((id) => keptCards.get(id) ?? []);
	}

	const { picked, cards } = await pickTitles(
		userId,
		rotation,
		now,
		new Set([...picks.map((pick) => pick.seriesId), ...unwanted]),
	);
	const added = picked.slice(0, wanted);
	if (added.length > 0) {
		const after = Math.max(-1, ...current.map((pick) => pick.position));
		await db
			.insert(featuredPick)
			.values(
				added.map((seriesId, index) => ({
					userId,
					rotation,
					seriesId,
					position: after + 1 + index,
				})),
			)
			.onConflictDoNothing();
	}
	if (current.length === 0) {
		await db
			.delete(featuredPick)
			.where(and(eq(featuredPick.userId, userId), lt(featuredPick.rotation, rotation - 1)));
	}

	return [
		...shown.flatMap((id) => keptCards.get(id) ?? []),
		...added.flatMap((id) => cards.get(id) ?? []),
	];
}

/**
 * Picks titles to feature for a rotation from the search index, in
 * {@link featuredPattern} order, leaving out `excluded`, with their cards.
 */
async function pickTitles(
	userId: string,
	rotation: number,
	now: Date,
	excluded: ReadonlySet<string>,
) {
	const [entries, longRunning, featuredBefore] = await Promise.all([
		db
			.select({
				anilistId: animeSearch.anilistId,
				seriesId: series.id,
				key: series.key,
				startDate: animeSearch.startDate,
				score: sql<number>`${animeSearch.averageScore}`,
				popularity: animeSearch.popularity,
				isDrawable: sql<boolean>`coalesce(
					${effectiveBackdrop} is not null and ${effectiveLogo} is not null,
					false
				)`,
			})
			.from(animeSearch)
			.leftJoin(series, eq(series.anilistId, animeSearch.anilistId))
			.where(
				and(
					eq(animeSearch.isAdult, false),
					inArray(animeSearch.format, [...featuredFormats]),
					inArray(animeSearch.status, ["RELEASING", "FINISHED"]),
					gte(animeSearch.averageScore, lowestThreshold.score),
					gte(animeSearch.popularity, lowestThreshold.popularity),
				),
			),
		db
			.selectDistinct({
				key: series.key,
			})
			.from(series)
			.innerJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
			.where(
				and(
					eq(animeSearch.status, "RELEASING"),
					lt(animeSearch.startDate, dateBefore(now, longRunningAfter)),
				),
			),
		excluded.size > 0
			? db
					.select({
						key: series.key,
					})
					.from(series)
					.where(inArray(series.id, [...excluded]))
			: [],
	]);

	const unstored = entries
		.filter((entry) => entry.seriesId === null && shelfOf([entry], now) !== null)
		.sort((a, b) => b.popularity - a.popularity)
		.slice(0, backfillPerPick);
	for (const { anilistId } of unstored) {
		await scheduleSeriesStore(anilistId, "backfill");
	}

	// The seasons of a show are matched to one TMDB title, which names the show.
	const skipped = new Set([...longRunning, ...featuredBefore].map((row) => row.key));
	const byShow = new Map<string, (typeof entries)[number][]>();
	for (const entry of entries) {
		if (entry.key !== null && entry.isDrawable && !skipped.has(entry.key)) {
			byShow.set(entry.key, [...(byShow.get(entry.key) ?? []), entry]);
		}
	}

	const shelves: Record<FeaturedShelf, string[]> = {
		fresh: [],
		acclaimed: [],
		popular: [],
	};
	for (const seasons of byShow.values()) {
		const shelf = shelfOf(seasons, now);
		const inOrder = seasons.toSorted((left, right) =>
			(left.startDate ?? "9999").localeCompare(right.startDate ?? "9999"),
		);
		const reaching = inOrder.filter((season) => shelfOf([season], now) === shelf);
		const featured = shelf === "fresh" ? reaching.at(-1) : reaching[0];
		if (shelf && featured?.seriesId) {
			shelves[shelf].push(featured.seriesId);
		}
	}

	const candidates = rotate(shelves, userId, rotation);
	const cards = await cardsOf([...new Set(Object.values(candidates).flat())]);
	return {
		picked: arrange(candidates, (id) => isShowable(cards.get(id))),
		cards,
	};
}

/** The cards of stored series, keyed by series ID. */
async function cardsOf(seriesIds: readonly string[]) {
	return seriesIds.length > 0
		? toSeriesCards(
				await db
					.select()
					.from(series)
					.where(inArray(series.id, [...seriesIds])),
			)
		: new Map<string, SeriesCard>();
}

/** Whether a title can lead the home page: it has a backdrop and logo to draw, and something streams it. */
function isShowable(card: SeriesCard | undefined) {
	return card !== undefined && !!card.backdrop_url && !!card.logo_url && card.audio.length > 0;
}
