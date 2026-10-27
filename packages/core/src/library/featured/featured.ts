import { defined, inSequence } from "@sora/shared";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch } from "../../database/schema/catalog";
import { featuredPick, seriesState } from "../../database/schema/library";
import { series, seriesRelated, titleArtwork, titleImage } from "../../database/schema/series";
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
const featuredFormats = ["TV", "MOVIE"] as const;

/** The smallest backdrop worth leading the home page: 4K, so it stays sharp full-bleed. */
export const minBackdropSize = {
	height: 2160,
	width: 3840,
} as const;

/**
 * Whether the backdrop readers see is a 4K one without text on it, and one
 * picture rather than a collage of panels. TMDB's default is often smaller,
 * has the title printed on it, or is a collage, so a title only qualifies
 * once its images are stored and looked at (see `storeFeaturedImagesJob`). Nothing here chooses a
 * backdrop: a title whose shown one is not good enough is left out until
 * someone chooses a better one.
 */
const hasCleanBackdrop = sql<boolean>`exists (
	select 1 from ${titleImage}
	where not coalesce(
			(select ${titleArtwork.hiddenFromFeatured} from ${titleArtwork} where ${titleArtwork.key} = ${series.key}),
			false
		)
		and ${titleImage.key} = ${series.key}
		and ${titleImage.type} = 'backdrop'
		and ${titleImage.url} = ${effectiveBackdrop}
		and ${titleImage.language} is null
		and ${titleImage.isCollage} = false
		and ${titleImage.width} >= ${minBackdropSize.width}
		and ${titleImage.height} >= ${minBackdropSize.height}
)`;

/** Titles not stored yet that one pick queues for the scheduler, the most popular first. */
const backfillPerPick = 20;

/** The cards of stored series, keyed by series ID. */
const cardsOf = async (seriesIds: readonly string[]) =>
	seriesIds.length > 0
		? toSeriesCards(
				await db
					.select()
					.from(series)
					.where(inArray(series.id, [...seriesIds])),
			)
		: new Map<string, SeriesCard>();

/** Whether a title can lead the home page: it has a backdrop and logo to draw, and something streams it. */
const isShowable = (card: SeriesCard | undefined) =>
	card !== undefined && !!card.backdrop_url && !!card.logo_url && card.audio.length > 0;

/**
 * Picks titles to feature for a rotation from the search index, leaving out
 * `excluded` and putting `rested` last, with their cards.
 */
const pickTitles = async (
	userId: string,
	rotation: number,
	now: Date,
	excluded: ReadonlySet<string>,
	rested: ReadonlySet<string>,
) => {
	const [entries, longRunning, spinOffs] = await Promise.all([
		db
			.select({
				anilistId: animeSearch.anilistId,
				isDrawable: sql<boolean>`coalesce(
					${effectiveLogo} is not null and ${hasCleanBackdrop},
					false
				)`,
				key: series.key,
				popularity: animeSearch.popularity,
				score: sql<number>`${animeSearch.averageScore}`,
				seriesId: series.id,
				startDate: animeSearch.startDate,
				status: animeSearch.status,
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
		db
			.selectDistinct({
				key: series.key,
			})
			.from(series)
			.innerJoin(seriesRelated, eq(seriesRelated.seriesId, series.id))
			.where(eq(seriesRelated.relation, "PARENT")),
	]);

	const current = entries.filter((entry) => isCurrent(entry, now));
	const unstored = current
		.filter((entry) => entry.seriesId === null)
		.toSorted((a, b) => b.popularity - a.popularity)
		.slice(0, backfillPerPick);
	await inSequence(unstored, ({ anilistId }) => scheduleSeriesStore(anilistId, "backfill"));

	// The seasons of a show are matched to one TMDB title, which names the show.
	const skipped = new Set([...longRunning, ...spinOffs].map((row) => row.key));
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
		.map((entry) => defined(entry.seriesId))
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
		cards,
		picked: arrange(ordered, (id) => isShowable(cards.get(id))),
	};
};

/**
 * Titles to feature on a profile's home page: what is popular right now, a
 * season or film that is airing or started in the last year and is well
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
 * Long-running titles such as Detective Conan are left out, as are spin-offs
 * and side stories that AniList gives a parent story, such as My Hero
 * Academia: Vigilantes, which readers know by the show it belongs to, and those
 * without a backdrop and logo to draw, and those nothing streams. Candidates not stored yet are queued for the
 * scheduler, a few with each pick, so later picks find them.
 */
export const getFeatured = async (userId: string, now = new Date()): Promise<SeriesCard[]> => {
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
					position: after + 1 + index,
					rotation,
					seriesId,
					userId,
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
};
