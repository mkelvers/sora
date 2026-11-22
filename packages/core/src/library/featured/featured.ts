import { defined, inSequence } from "@sora/shared";
import { and, asc, eq, gte, inArray, lt, lte, max, or, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch, animeTrend } from "../../database/schema/catalog";
import { featuredPick, seriesState } from "../../database/schema/library";
import {
	series,
	seriesEpisode,
	seriesRelated,
	titleArtwork,
	titleBackdropUpscale,
	titleImage,
} from "../../database/schema/series";
import type { FeaturedCard, SeriesCard } from "../../models/series";
import { scheduleSeriesStore } from "../../scheduler/queue";
import { effectiveBackdrop, effectiveLogo } from "../../series/edges";
import { toSeriesCards } from "../../series/queries";
import { upscaledBackdropUrl } from "../../series/upscaled-backdrop";
import {
	activityKeptFor,
	activityOf,
	arrange,
	currentFor,
	currentThresholds,
	dateBefore,
	featuredCount,
	historyRotations,
	isCurrent,
	longRunningAfter,
	minimumCount,
	order,
	rotationOf,
	rotationStartOf,
	spareCandidates,
} from "./rotation";
import type { Activity, Candidate } from "./rotation";

/** Formats worth featuring: shows and films, not music videos, specials, or OVAs. */
const featuredFormats = ["TV", "MOVIE"] as const;

/** The smallest backdrop worth leading the home page: 4K, so it stays sharp full-bleed. */
export const minBackdropSize = {
	height: 2160,
	width: 3840,
} as const;

/**
 * Whether the backdrop readers see is a 4K one without text on it, and one
 * picture rather than a collage of panels. An upscaled backdrop (see
 * `titleBackdropUpscale`) is its original with a larger size: it counts by
 * the original's language and collage check and its own size. TMDB's default is often smaller,
 * has the title printed on it, or is a collage, so a title only qualifies
 * once its images are stored and looked at (see `storeFeaturedImagesJob`). Nothing here chooses a
 * backdrop: a title whose shown one is not good enough is left out until
 * someone chooses a better one.
 */
const hasCleanBackdrop = sql<boolean>`exists (
	select 1 from ${titleImage}
	left join ${titleBackdropUpscale}
		on ${titleBackdropUpscale.key} = ${titleImage.key}
		and ${titleBackdropUpscale.sourceUrl} = ${titleImage.url}
		and ${titleBackdropUpscale.status} = 'done'
	where not coalesce(
			(select ${titleArtwork.hiddenFromFeatured} from ${titleArtwork} where ${titleArtwork.key} = ${series.key}),
			false
		)
		and ${titleImage.key} = ${series.key}
		and ${titleImage.type} = 'backdrop'
		and (
			${titleImage.url} = ${effectiveBackdrop}
			or ${upscaledBackdropUrl("")}::text || ${titleBackdropUpscale.id}::text = ${effectiveBackdrop}
		)
		and ${titleImage.language} is null
		and ${titleImage.isCollage} = false
		and coalesce(
			case when ${upscaledBackdropUrl("")}::text || ${titleBackdropUpscale.id}::text = ${effectiveBackdrop} then ${titleBackdropUpscale.width} end,
			${titleImage.width}
		) >= ${minBackdropSize.width}
		and coalesce(
			case when ${upscaledBackdropUrl("")}::text || ${titleBackdropUpscale.id}::text = ${effectiveBackdrop} then ${titleBackdropUpscale.height} end,
			${titleImage.height}
		) >= ${minBackdropSize.height}
)`;

/** Titles not stored yet that one pick queues for the scheduler, the most popular first. */
const backfillPerPick = 20;

/** The cards of stored series, keyed by series ID. */
const cardsOf = async (seriesIds: readonly string[]) => {
	if (seriesIds.length > 0) {
		return toSeriesCards(
			await db
				.select()
				.from(series)
				.where(inArray(series.id, [...seriesIds])),
		);
	}

	return new Map<string, SeriesCard>();
};

/** Whether a title can lead the home page: it has a backdrop and logo to draw, and something streams it. */
const isShowable = (card: SeriesCard | undefined) =>
	card !== undefined && !!card.backdrop_url && !!card.logo_url && card.audio.length > 0;

/**
 * Where each featured card opens: the first season of its show, by release,
 * that the profile has not completed, so a title it never watched starts at
 * its beginning. A show it completed in full opens at the card itself.
 */
const withStarts = async (
	userId: string,
	cards: readonly SeriesCard[],
): Promise<FeaturedCard[]> => {
	if (cards.length === 0) {
		return [];
	}

	const keys = await db
		.select({
			key: series.key,
		})
		.from(series)
		.where(
			inArray(
				series.id,
				cards.map((card) => card.id),
			),
		);

	const seasons = await db
		.select({
			completed: sql<boolean>`${seriesState.status} = 'completed'`,
			id: series.id,
			key: series.key,
		})
		.from(series)
		.innerJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
		.leftJoin(seriesState, and(eq(seriesState.seriesId, series.id), eq(seriesState.userId, userId)))
		.where(
			and(
				inArray(
					series.key,
					keys.map((row) => row.key),
				),
				inArray(animeSearch.format, [...featuredFormats]),
			),
		)
		.orderBy(asc(animeSearch.startDate));

	const starts = new Map<string, string>();
	const keyOf = new Map(seasons.map((season) => [season.id, season.key]));

	for (const season of seasons) {
		if (!season.completed && !starts.has(season.key)) {
			starts.set(season.key, season.id);
		}
	}

	return cards.map((card) => ({
		...card,
		start_id: starts.get(keyOf.get(card.id) ?? "") ?? card.id,
	}));
};

/**
 * The well-liked, popular TV seasons and films of the search index, airing or
 * from the last year; see {@link isCurrent}, which this narrows down to.
 */
export const isFeaturedEntry = (now: Date) =>
	and(
		eq(animeSearch.isAdult, false),
		inArray(animeSearch.format, [...featuredFormats]),
		inArray(animeSearch.status, ["RELEASING", "FINISHED"]),
		gte(animeSearch.averageScore, currentThresholds.score),
		or(
			and(
				eq(animeSearch.status, "RELEASING"),
				gte(animeSearch.popularity, currentThresholds.airingPopularity),
			),
			and(
				gte(animeSearch.popularity, currentThresholds.popularity),
				gte(animeSearch.startDate, dateBefore(now, currentFor)),
			),
		),
	);

/** When the newest episode of each series aired, up to `now`, by series ID. */
const lastAirings = async (seriesIds: readonly string[], now: Date) => {
	if (seriesIds.length === 0) {
		return new Map<string, Date>();
	}

	const rows = await db
		.select({
			lastAiredAt: max(seriesEpisode.airedAt),
			seriesId: seriesEpisode.seriesId,
		})
		.from(seriesEpisode)
		.where(and(inArray(seriesEpisode.seriesId, [...seriesIds]), lte(seriesEpisode.airedAt, now)))
		.groupBy(seriesEpisode.seriesId);

	return new Map(
		rows.flatMap((row) => {
			if (row.lastAiredAt) {
				return [[row.seriesId, row.lastAiredAt] as const];
			}

			return [];
		}),
	);
};

/** The AniList activity of each entry over the last month, by AniList ID. */
const activities = async (anilistIds: readonly number[], now: Date) => {
	if (anilistIds.length === 0) {
		return new Map<number, Activity>();
	}

	const rows = await db
		.select()
		.from(animeTrend)
		.where(
			and(
				inArray(animeTrend.anilistId, [...anilistIds]),
				gte(animeTrend.day, dateBefore(now, activityKeptFor)),
			),
		);

	const byEntry = Map.groupBy(rows, (row) => row.anilistId);

	return new Map(anilistIds.map((id) => [id, activityOf(byEntry.get(id) ?? [], now)] as const));
};

/**
 * Picks titles to feature for a rotation from the search index, leaving out
 * `excluded`, with their cards. `lastPicked` holds the rotation each title
 * was last featured in, and `shown` how many are featured this rotation
 * already; see {@link order} and {@link arrange}.
 */
const pickTitles = async ({
	userId,
	rotation,
	now,
	excluded,
	lastPicked,
	shown,
}: {
	userId: string;
	rotation: number;
	now: Date;
	excluded: ReadonlySet<string>;
	lastPicked: ReadonlyMap<string, number>;
	shown: number;
}) => {
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
			.where(isFeaturedEntry(now)),
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

	const chosen = [...newest.values()].filter((entry) => !excluded.has(defined(entry.seriesId)));

	const [airings, activity] = await Promise.all([
		lastAirings(
			chosen.map((entry) => defined(entry.seriesId)),
			now,
		),
		activities(
			chosen.map((entry) => entry.anilistId),
			now,
		),
	]);

	const candidates = chosen.map((entry): Candidate => {
		const id = defined(entry.seriesId);
		const picked = lastPicked.get(id);

		return {
			activity: activity.get(entry.anilistId) ?? {
				past: null,
				recent: null,
			},
			id,
			lastAiredAt: airings.get(id) ?? null,
			lastPickedAt: picked === undefined ? null : rotationStartOf(picked),
			startDate: entry.startDate,
			status: entry.status,
		};
	});

	const ordered = order(candidates, userId, rotation, now);

	const tried = [...ordered.news, ...ordered.repeats].slice(
		0,
		featuredCount + minimumCount + spareCandidates,
	);

	const cards = await cardsOf(tried);

	return {
		cards,
		picked: arrange(ordered, (id) => tried.includes(id) && isShowable(cards.get(id)), shown),
	};
};

/**
 * Titles to feature on a profile's home page, each with a reason to be there
 * now: it is airing, its season ended or its film came out in the last four
 * weeks, or people on AniList talk about it more than a month ago. A season
 * past its moment, however well liked, is not featured; see {@link reasonsOf}.
 * The seasons of one show share its backdrop and logo, so a show is featured
 * through its newest current season.
 *
 * They are picked once a day, at 06:00 UTC (see `rotationStart`), in each
 * profile's own order, the more talked-about titles more likely first, and
 * kept for the day: a title that can no longer be shown gives its place to
 * another, as does one the profile dropped from its watchlist. A title
 * featured before comes back only with something new: an episode aired since,
 * or it rises again a week or more later (see {@link hasNews}). The carousel
 * holds fewer titles rather than repeat others, down to {@link minimumCount}.
 *
 * Reads only the database: candidates come from the search index, and their
 * AniList activity from what `storeAnimeTrendsJob` stores.
 * Long-running titles such as Detective Conan are left out, as are spin-offs
 * and side stories that AniList gives a parent story, such as My Hero
 * Academia: Vigilantes, which readers know by the show it belongs to, and those
 * without a backdrop and logo to draw, and those nothing streams. Candidates not stored yet are queued for the
 * scheduler, a few with each pick, so later picks find them.
 */
export const getFeatured = async (userId: string, now = new Date()): Promise<FeaturedCard[]> => {
	const rotation = rotationOf(now);

	const picks = await db
		.select()
		.from(featuredPick)
		.where(
			and(eq(featuredPick.userId, userId), gte(featuredPick.rotation, rotation - historyRotations)),
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

	if (shown.length >= featuredCount) {
		return withStarts(
			userId,
			shown.slice(0, featuredCount).flatMap((id) => keptCards.get(id) ?? []),
		);
	}

	const lastPicked = new Map<string, number>();

	for (const pick of picks) {
		if (pick.rotation !== rotation) {
			lastPicked.set(pick.seriesId, Math.max(pick.rotation, lastPicked.get(pick.seriesId) ?? 0));
		}
	}

	const { picked: added, cards } = await pickTitles({
		excluded: new Set([...kept, ...unwanted]),
		lastPicked,
		now,
		rotation,
		shown: shown.length,
		userId,
	});

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
				and(
					eq(featuredPick.userId, userId),
					lt(featuredPick.rotation, rotation - historyRotations),
				),
			);
	}

	return withStarts(userId, [
		...shown.flatMap((id) => keptCards.get(id) ?? []),
		...added.flatMap((id) => cards.get(id) ?? []),
	]);
};
