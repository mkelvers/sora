import { defined, sequence } from "@sora/shared";
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
import { upscaledBackdropUrl } from "../../series/upscaled-backdrop";
import { Cards } from "./cards";
import {
	activityKeptFor,
	activityOf,
	arrange,
	currentFor,
	currentThresholds,
	dateBefore,
	maximumCount,
	remembered,
	isCurrent,
	longRunningAfter,
	minimumCount,
	order,
	numberOf,
	startOf,
	spareCandidates,
} from "./rotation";
import type { Activity, Candidate } from "./rotation";

/** Formats worth featuring: shows and films, not music videos, specials, or OVAs. */
const formats = ["TV", "MOVIE"] as const;

/** The smallest backdrop worth leading the home page: 4K, so it stays sharp full-bleed. */
export const minBackdropSize = {
	height: 2160,
	width: 3840,
} as const;

/**
 * The well-liked, popular TV seasons and films of the search index, airing or
 * from the last year; see {@link isCurrent}, which this narrows down to.
 */
export const worthFeaturing = (now: Date) =>
	and(
		eq(animeSearch.isAdult, false),
		inArray(animeSearch.format, [...formats]),
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

/** What one profile is featured in one rotation. */
class Picker {
	/**
	 * Whether the backdrop readers see is a 4K one without text on it, and one
	 * picture rather than a collage of panels. An upscaled backdrop (see
	 * `titleBackdropUpscale`) is its original with a larger size: it counts by
	 * the original's language and collage check and its own size. TMDB's default is often smaller,
	 * has the title printed on it, or is a collage, so a title only qualifies
	 * once its images are stored and looked at (see `storeImages`). Nothing here chooses a
	 * backdrop: a title whose shown one is not good enough is left out until
	 * someone chooses a better one.
	 */
	static readonly #cleanBackdrop = sql<boolean>`exists (
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

	readonly #userId: string;
	readonly #rotation: number;
	readonly #now: Date;

	constructor(userId: string, rotation: number, now: Date) {
		this.#userId = userId;
		this.#rotation = rotation;
		this.#now = now;
	}

	/**
	 * Where each featured card opens: the first season of its show, by release,
	 * that the profile has not completed, so a title it never watched starts at
	 * its beginning. A show it completed in full opens at the card itself.
	 */
	async starts(cards: readonly SeriesCard[]): Promise<FeaturedCard[]> {
		const userId = this.#userId;

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
			.leftJoin(
				seriesState,
				and(eq(seriesState.seriesId, series.id), eq(seriesState.userId, userId)),
			)
			.where(
				and(
					inArray(
						series.key,
						keys.map((row) => row.key),
					),
					inArray(animeSearch.format, [...formats]),
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
	}

	/**
	 * Picks titles to feature for the rotation from the search index, leaving out
	 * `excluded`, with their cards. `lastPicked` holds the rotation each title
	 * was last featured in, and `shown` how many are featured this rotation
	 * already; see {@link order} and {@link arrange}.
	 */
	async pick({
		excluded,
		lastPicked,
		shown,
	}: {
		excluded: ReadonlySet<string>;
		lastPicked: ReadonlyMap<string, number>;
		shown: number;
	}) {
		const userId = this.#userId;
		const rotation = this.#rotation;
		const now = this.#now;

		/** Titles not stored yet that one pick queues for the scheduler, the most popular first. */
		const backfillPerPick = 20;

		const [entries, longRunning, spinOffs] = await Promise.all([
			db
				.select({
					anilistId: animeSearch.anilistId,
					isDrawable: sql<boolean>`coalesce(
						${effectiveLogo} is not null and ${Picker.#cleanBackdrop},
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
				.where(worthFeaturing(now)),
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

		await sequence.all(unstored, ({ anilistId }) => scheduleSeriesStore(anilistId, "backfill"));

		// The seasons of a show are matched to one TMDB title, which names the show.
		const skipped = new Set([...longRunning, ...spinOffs].map((row) => row.key));
		const newest = new Map<string, (typeof current)[number]>();

		for (const entry of current) {
			if (entry.seriesId === null || entry.key === null) {
				continue;
			}

			if (!entry.isDrawable || skipped.has(entry.key)) {
				continue;
			}

			const known = newest.get(entry.key);

			if (!known || (entry.startDate ?? "") > (known.startDate ?? "")) {
				newest.set(entry.key, entry);
			}
		}

		const chosen = [...newest.values()].filter((entry) => !excluded.has(defined(entry.seriesId)));

		const [airings, activity] = await Promise.all([
			this.#airings(chosen.map((entry) => defined(entry.seriesId))),
			this.#activities(chosen.map((entry) => entry.anilistId)),
		]);

		const candidates = chosen.map((entry): Candidate => {
			const id = defined(entry.seriesId);
			const picked = lastPicked.get(id);
			let lastPickedAt: Date | null = null;

			if (picked !== undefined) {
				lastPickedAt = startOf(picked);
			}

			return {
				activity: activity.get(entry.anilistId) ?? {
					past: null,
					recent: null,
				},
				id,
				lastAiredAt: airings.get(id) ?? null,
				lastPickedAt,
				startDate: entry.startDate,
				status: entry.status,
			};
		});

		const ordered = order(candidates, userId, rotation, now);

		const tried = [...ordered.news, ...ordered.repeats].slice(
			0,
			maximumCount + minimumCount + spareCandidates,
		);

		const cards = await Cards.load(tried);

		return {
			cards,
			picked: arrange(ordered, (id) => tried.includes(id) && cards.showable(id), shown),
		};
	}

	/** When the newest episode of each series aired, up to `now`, by series ID. */
	async #airings(seriesIds: readonly string[]) {
		const now = this.#now;

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
	}

	/** The AniList activity of each entry over the last month, by AniList ID. */
	async #activities(anilistIds: readonly number[]) {
		const now = this.#now;

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
	}
}

/**
 * Titles to feature on a profile's home page, each with a reason to be there
 * now: it is airing, its season ended or its film came out in the last four
 * weeks, or people on AniList talk about it more than a month ago. A season
 * past its moment, however well liked, is not featured; see {@link reasonsOf}.
 * The seasons of one show share its backdrop and logo, so a show is featured
 * through its newest current season.
 *
 * They are picked once a day, at 06:00 UTC (see `changeAt`), in each
 * profile's own order, the more talked-about titles more likely first, and
 * kept for the day: a title that can no longer be shown gives its place to
 * another, as does one the profile dropped from its watchlist. A title
 * featured before comes back only with something new: an episode aired since,
 * or it rises again a week or more later (see {@link hasNews}). The carousel
 * holds fewer titles rather than repeat others, down to {@link minimumCount}.
 *
 * Reads only the database: candidates come from the search index, and their
 * AniList activity from what `storeActivity` stores.
 * Long-running titles such as Detective Conan are left out, as are spin-offs
 * and side stories that AniList gives a parent story, such as My Hero
 * Academia: Vigilantes, which readers know by the show it belongs to, and those
 * without a backdrop and logo to draw, and those nothing streams. Candidates not stored yet are queued for the
 * scheduler, a few with each pick, so later picks find them.
 */
export const getFeatured = async (userId: string, now = new Date()): Promise<FeaturedCard[]> => {
	const rotation = numberOf(now);
	const picker = new Picker(userId, rotation, now);

	const picks = await db
		.select()
		.from(featuredPick)
		.where(and(eq(featuredPick.userId, userId), gte(featuredPick.rotation, rotation - remembered)))
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
	const keptCards = await Cards.load(kept);
	const shown = kept.filter((id) => !unwanted.has(id) && keptCards.showable(id));

	if (shown.length >= maximumCount) {
		return picker.starts(shown.slice(0, maximumCount).flatMap((id) => keptCards.get(id) ?? []));
	}

	const lastPicked = new Map<string, number>();

	for (const pick of picks) {
		if (pick.rotation !== rotation) {
			lastPicked.set(pick.seriesId, Math.max(pick.rotation, lastPicked.get(pick.seriesId) ?? 0));
		}
	}

	const { picked: added, cards } = await picker.pick({
		excluded: new Set([...kept, ...unwanted]),
		lastPicked,
		shown: shown.length,
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
				and(eq(featuredPick.userId, userId), lt(featuredPick.rotation, rotation - remembered)),
			);
	}

	return picker.starts([
		...shown.flatMap((id) => keptCards.get(id) ?? []),
		...added.flatMap((id) => cards.get(id) ?? []),
	]);
};
