import { attempt, chunked, day, inParallel, sequence } from "@sora/shared";
import { and, eq, isNull, like, lt, or, sql } from "drizzle-orm";

import { db } from "../database/client";
import { series, titleFacts } from "../database/schema/series";
import type { TitleAward } from "../database/schema/series";
import { Nominations } from "./nominations";
import { TmdbTitle } from "./tmdb-title";
import type { TmdbFacts } from "./tmdb-title";

export const facts = {
	/**
	 * Stores what TMDB and IMDb say about stored titles TMDB lists (see
	 * `titleFacts`): those with none stored first, then those whose are older
	 * than 30 days, {@link titlesPerRun} at most. Costs a TMDB
	 * request per title and an IMDb request per 25.
	 * A title TMDB fails on is left for the next run.
	 *
	 * @throws {Error} when IMDb fails; nothing of the run is stored then.
	 */
	async store() {
		/**
		 * The country IMDb names some awards with, as in `Academy Awards, USA`,
		 * which the award is known without.
		 */
		const awardCountry = /,\s+\p{Lu}[\p{L}\s.]*$/u;

		/** Titles asked of IMDb in one request. */
		const titlesPerRequest = 25;

		/** TMDB requests at once; TMDB allows about 50 a second. */
		const tmdbConcurrency = 8;

		/** Titles {@link facts.store} fetches facts for in one run. */
		const titlesPerRun = 500;

		/**
		 * How long stored facts are kept before they are fetched again. Awards are
		 * given once a year and ratings rarely change.
		 */
		const lifetimeMs = 30 * day;

		const due = await db
			.selectDistinct({
				fetchedAt: titleFacts.fetchedAt,
				key: series.key,
			})
			.from(series)
			.leftJoin(titleFacts, eq(titleFacts.key, series.key))
			.where(
				and(
					or(like(series.key, "tv:%"), like(series.key, "movie:%")),
					or(
						isNull(titleFacts.fetchedAt),
						lt(titleFacts.fetchedAt, new Date(Date.now() - lifetimeMs)),
					),
				),
			)
			.orderBy(sql`${titleFacts.fetchedAt} asc nulls first`)
			.limit(titlesPerRun);

		const fetched = new Map<string, TmdbFacts>();
		await inParallel(due, tmdbConcurrency, async ({ key }) => {
			const { data, error } = await attempt(new TmdbTitle(key).facts());

			if (error) {
				console.warn(`TMDB facts of ${key} could not be read: ${error.message}`);

				return;
			}

			fetched.set(
				key,
				data ?? {
					certification: null,
					descriptors: [],
					imdbId: null,
					keywords: [],
				},
			);
		});

		const ids = [...new Set([...fetched.values()].flatMap((details) => details.imdbId ?? []))];

		// The awards IMDb lists each title as having won or been nominated for, by
		// IMDb ID: each award once a year as won, and once as nominated for when
		// any of its nominations that year did not win. A title IMDb does not know
		// has none.
		const groups = await sequence.all(chunked(ids, titlesPerRequest), (chunk) =>
			new Nominations(chunk).fetch(),
		);

		const awards = new Map(
			groups.flat().map(([id, title]): [string, TitleAward[]] => {
				const listed = new Map<string, TitleAward>();

				for (const { node } of title.awardNominations.edges) {
					const name = node.award.event.text.trim().replace(awardCountry, "");
					listed.set(`${name}:${node.award.year}:${node.isWinner}`, {
						name,
						won: node.isWinner,
						year: node.award.year,
					});
				}

				return [id, [...listed.values()]];
			}),
		);

		const now = new Date();

		const rows = [...fetched].map(([key, details]) => ({
			awards: (details.imdbId && awards.get(details.imdbId)) || [],
			certification: details.certification,
			descriptors: details.descriptors,
			fetchedAt: now,
			imdbId: details.imdbId,
			key,
			keywords: details.keywords,
		}));

		if (rows.length > 0) {
			await db
				.insert(titleFacts)
				.values(rows)
				.onConflictDoUpdate({
					set: {
						awards: sql`excluded.awards`,
						certification: sql`excluded.certification`,
						descriptors: sql`excluded.descriptors`,
						fetchedAt: sql`excluded.fetched_at`,
						imdbId: sql`excluded.imdb_id`,
						keywords: sql`excluded.keywords`,
					},
					target: titleFacts.key,
				});
		}

		return {
			awarded: rows.filter((row) => row.awards.length > 0).length,
			stored: rows.length,
		};
	},
};
