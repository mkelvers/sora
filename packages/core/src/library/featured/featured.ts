import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch, featuredPick, noArtwork, series, seriesEntry } from "../../database/schema";
import { scheduleSeriesStore } from "../../scheduler/queue";
import type { SeriesCard } from "../../series/models";
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
	type FeaturedEntry,
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
 * {@link featuredPattern}).
 *
 * They are picked once a week, on Monday morning (see `rotationStart`), in
 * each profile's own order, and kept for the week: a title that can no
 * longer be shown gives its place to another. No title is featured two
 * weeks in a row.
 *
 * Reads only the database: candidates come from the search index.
 * Long-running titles such as Detective Conan are left out, as are those
 * without a backdrop and logo to draw, and
 * those nothing streams. Candidates not stored yet are queued for the
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

	const current = picks.filter((pick) => pick.rotation === rotation);
	const kept = current.map((pick) => pick.seriesId);
	const keptCards = await cardsOf(kept);
	const shown = kept.filter((id) => isShowable(keptCards.get(id)));
	const wanted = featuredPattern.length - shown.length;
	if (wanted <= 0) {
		return shown.slice(0, featuredPattern.length).flatMap((id) => keptCards.get(id) ?? []);
	}

	const { picked, cards } = await pickTitles(
		userId,
		rotation,
		now,
		new Set(picks.map((pick) => pick.seriesId)),
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
	const [entries, longRunning] = await Promise.all([
		db
			.select({
				anilistId: animeSearch.anilistId,
				seriesId: seriesEntry.seriesId,
				startDate: animeSearch.startDate,
				score: sql<number>`${animeSearch.averageScore}`,
				popularity: animeSearch.popularity,
				isDrawable: sql<boolean>`coalesce(
					nullif(coalesce(${series.backdropUrlOverride}, ${series.backdropUrl}), ${noArtwork}) is not null
					and nullif(coalesce(${series.logoUrlOverride}, ${series.logoUrl}), ${noArtwork}) is not null,
					false
				)`,
			})
			.from(animeSearch)
			.leftJoin(seriesEntry, eq(seriesEntry.anilistId, animeSearch.anilistId))
			.leftJoin(series, eq(series.id, seriesEntry.seriesId))
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
				seriesId: seriesEntry.seriesId,
			})
			.from(seriesEntry)
			.innerJoin(animeSearch, eq(animeSearch.anilistId, seriesEntry.anilistId))
			.where(
				and(
					eq(animeSearch.status, "RELEASING"),
					lt(animeSearch.startDate, dateBefore(now, longRunningAfter)),
				),
			),
	]);

	const unstored = entries
		.filter((entry) => entry.seriesId === null && shelfOf([entry], now) !== null)
		.sort((a, b) => b.popularity - a.popularity)
		.slice(0, backfillPerPick);
	for (const { anilistId } of unstored) {
		await scheduleSeriesStore(anilistId, "backfill");
	}

	const skipped = new Set([...excluded, ...longRunning.map((row) => row.seriesId)]);
	const bySeries = new Map<string, FeaturedEntry[]>();
	for (const entry of entries) {
		if (entry.seriesId !== null && entry.isDrawable && !skipped.has(entry.seriesId)) {
			bySeries.set(entry.seriesId, [...(bySeries.get(entry.seriesId) ?? []), entry]);
		}
	}

	const shelves: Record<FeaturedShelf, string[]> = {
		fresh: [],
		acclaimed: [],
		popular: [],
	};
	for (const [seriesId, seriesEntries] of bySeries) {
		const shelf = shelfOf(seriesEntries, now);
		if (shelf) {
			shelves[shelf].push(seriesId);
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
	return card !== undefined && !!card.backdropUrl && !!card.logoUrl && card.audio.length > 0;
}
