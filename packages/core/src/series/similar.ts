import { and, asc, eq, inArray, not, sql } from "drizzle-orm";
import { z } from "zod";

import type { MediaFormat } from "../anilist/graphql.generated";
import { catalogSeriesAllowed } from "../catalog/visibility";
import { db } from "../database/client";
import { anime, animeSearch } from "../database/schema/catalog";
import { series } from "../database/schema/series";
import { SeriesNotFoundError } from "../errors";
import type { SeriesCard } from "../models/series";
import { FranchiseWalk } from "./franchise-walk";
import { toSeriesCards } from "./queries";

/**
 * Titles like a series' franchise, the most recommended first, at most
 * {@link similarLimit}.
 *
 * Each title of the franchise's own story carries AniList's recommendations,
 * best rated first. A recommendation counts more the higher it is ranked and
 * the more of the franchise's titles recommend it, so a long show's seasons
 * agree on what is like it. Recommendations are gathered per TMDB title (the
 * series key) and shown as its earliest show or film, so Demon Slayer is
 * recommended once, as its first season, however many of its seasons AniList
 * names. The franchise's own titles, its spin-offs and crossovers, adult
 * titles, and titles with nothing to stream are left out.
 *
 * Reads only the database.
 *
 * @throws {SeriesNotFoundError} when the ID does not identify a series.
 */
export const getSimilarSeries = async (id: string): Promise<SeriesCard[]> => {
	/** Formats a recommendation is shown as: the show or film, not a special or OVA. */
	const shownFormats: MediaFormat[] = ["TV", "ONA", "MOVIE"];

	/** How many recommendations AniList gives each title (see `fragments.graphql`). */
	const perTitle = 12;

	/**
	 * The most titles recommended: a whole number of carousel slides at four
	 * and seven posters a slide, the widths a laptop and a large screen show.
	 */
	const limit = 28;

	const [row] = await db.select().from(series).where(eq(series.id, id)).limit(1);

	if (!row) {
		throw new SeriesNotFoundError(id);
	}

	const { ids, crossovers, apart } = await new FranchiseWalk(row.anilistId).reach();

	const own = [
		row.anilistId,
		...ids.filter((anilistId) => !crossovers.has(anilistId) && !apart.has(anilistId)),
	];

	const franchise = [row.anilistId, ...ids];

	const rows = await db.execute(sql`
		select (recommendation.node->'mediaRecommendation'->>'id')::int as "anilistId",
			(recommendation.position - 1)::int as rank
		from ${anime},
			jsonb_array_elements(${anime.media}->'recommendations'->'nodes')
				with ordinality as recommendation(node, position)
		where ${anime.anilistId} in ${own}
			and recommendation.node->'mediaRecommendation'->>'id' is not null
	`);

	const recommended = z
		.array(
			z.object({
				anilistId: z.number(),
				rank: z.number(),
			}),
		)
		.parse([...rows]);

	const scoreOf = new Map<number, number>();

	for (const { anilistId, rank } of recommended) {
		scoreOf.set(anilistId, (scoreOf.get(anilistId) ?? 0) + perTitle - rank);
	}

	const excludedKeys = db
		.select({
			key: series.key,
		})
		.from(series)
		.where(inArray(series.anilistId, franchise));

	let candidates: {
		anilistId: number;
		key: string;
	}[] = [];

	if (scoreOf.size > 0) {
		candidates = await db
			.select({
				anilistId: series.anilistId,
				key: series.key,
			})
			.from(series)
			.where(
				and(
					inArray(series.anilistId, [...scoreOf.keys()]),
					not(inArray(series.anilistId, franchise)),
					not(inArray(series.key, excludedKeys)),
				),
			);
	}

	const scoreOfKey = new Map<string, number>();

	for (const { anilistId, key } of candidates) {
		scoreOfKey.set(key, (scoreOfKey.get(key) ?? 0) + (scoreOf.get(anilistId) ?? 0));
	}

	if (scoreOfKey.size === 0) {
		return [];
	}

	const shown = await db
		.select({
			popularity: animeSearch.popularity,
			row: series,
		})
		.from(series)
		.innerJoin(animeSearch, eq(animeSearch.anilistId, series.anilistId))
		.where(
			and(
				inArray(series.key, [...scoreOfKey.keys()]),
				inArray(animeSearch.format, shownFormats),
				eq(animeSearch.isAdult, false),
				catalogSeriesAllowed,
			),
		)
		.orderBy(asc(series.startDate), asc(series.anilistId));

	const earliest = new Map<string, (typeof shown)[number]>();

	for (const title of shown) {
		if (!earliest.has(title.row.key)) {
			earliest.set(title.row.key, title);
		}
	}

	const ranked = [...earliest.values()].toSorted(
		(left, right) =>
			(scoreOfKey.get(right.row.key) ?? 0) - (scoreOfKey.get(left.row.key) ?? 0) ||
			(right.popularity ?? 0) - (left.popularity ?? 0),
	);

	const cards = await toSeriesCards(ranked.map(({ row: title }) => title));

	return ranked
		.flatMap(({ row: title }) => {
			const card = cards.get(title.id);

			if (card && card.audio.length > 0) {
				return [card];
			}

			return [];
		})
		.slice(0, limit);
};
