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
	currentThresholds,
	featuredCount,
	isCurrent,
	longRunningAfter,
	restRotations,
	rotate,
	rotationOf,
	spareCandidates,
} from "./rotation";

/** Formats worth featuring: shows and films, not music videos, specials, or OVAs. */
const featuredFormats = ["TV", "ONA", "MOVIE"] as const;

/** Titles not stored yet that one pick queues for the scheduler, the most popular first. */
const backfillPerPick = 20;

/**
 * Titles to feature on a profile's home page: what is popular right now, a
 * season or film that is airing or started in the last six months and is well
 * liked, never an old favourite without a new season. The seasons of one
 * show share its backdrop and logo, so a show is featured through its newest
 * current season.
 *
 * They are picked once a day, at 06:00 UTC (see `rotationStart`), in each
 * profile's own order, and kept for the day: a title that can no longer be
 * shown gives its place to another, as does one the profile dropped from its
 * watchlist. A title is rested for a week (`restRotations`) after it was
 * featured, and shown again only when too few others are current to fill the
 * place.
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
			and(eq(featuredPick.userId, userId), gte(featuredPick.rotation, rotation - restRotations)),
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
	const wanted = featuredCount - shown.length;
	if (wanted <= 0) {
		return shown.slice(0, featuredCount).flatMap((id) => keptCards.get(id) ?? []);
	}

	const { picked, cards } = await pickTitles(
		userId,
		rotation,
		now,
		new Set([...kept, ...unwanted]),
		new Set(picks.filter((pick) => pick.rotation !== rotation).map((pick) => pick.seriesId)),
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
			.where(
				and(eq(featuredPick.userId, userId), lt(featuredPick.rotation, rotation - restRotations)),
			);
	}

	return [
		...shown.flatMap((id) => keptCards.get(id) ?? []),
		...added.flatMap((id) => cards.get(id) ?? []),
	];
}

/**
 * Picks titles to feature for a rotation from the search index, leaving out
 * `excluded` and putting `rested` last, with their cards.
 */
async function pickTitles(
	userId: string,
	rotation: number,
	now: Date,
	excluded: ReadonlySet<string>,
	rested: ReadonlySet<string>,
) {
	const [entries, longRunning] = await Promise.all([
		db
			.select({
				anilistId: animeSearch.anilistId,
				seriesId: series.id,
				key: series.key,
				startDate: animeSearch.startDate,
				status: animeSearch.status,
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
					gte(animeSearch.averageScore, currentThresholds.score),
					gte(animeSearch.popularity, currentThresholds.popularity),
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
	]);

	const current = entries.filter((entry) => isCurrent(entry, now));
	const unstored = current
		.filter((entry) => entry.seriesId === null)
		.sort((a, b) => b.popularity - a.popularity)
		.slice(0, backfillPerPick);
	for (const { anilistId } of unstored) {
		await scheduleSeriesStore(anilistId, "backfill");
	}

	// The seasons of a show are matched to one TMDB title, which names the show.
	const skipped = new Set(longRunning.map((row) => row.key));
	const newest = new Map<string, (typeof current)[number]>();
	for (const entry of current) {
		if (
			entry.seriesId === null ||
			entry.key === null ||
			!entry.isDrawable ||
			skipped.has(entry.key)
		) {
			continue;
		}
		const known = newest.get(entry.key);
		if (!known || (entry.startDate ?? "") > (known.startDate ?? "")) {
			newest.set(entry.key, entry);
		}
	}

	const candidates = [...newest.values()]
		.map((entry) => entry.seriesId!)
		.filter((id) => !excluded.has(id));
	const ordered = [
		...rotate(
			candidates.filter((id) => !rested.has(id)),
			userId,
			rotation,
		),
		...rotate(
			candidates.filter((id) => rested.has(id)),
			userId,
			rotation,
		),
	].slice(0, featuredCount + spareCandidates);
	const cards = await cardsOf(ordered);
	return {
		picked: arrange(ordered, (id) => isShowable(cards.get(id))),
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
