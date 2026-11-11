import { setTimeout as sleep } from "node:timers/promises";

import {
	attempt,
	chunked,
	day,
	inParallel,
	inSequence,
	minute,
	parseRetryAfter,
	second,
} from "@sora/shared";
import { and, eq, isNull, like, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { series, titleFacts } from "../database/schema/series";
import type { TitleAward } from "../database/schema/series";
import { tmdb } from "../tmdb/client";
import { parseKey } from "./series";
import type { SeriesKey } from "./series";

/**
 * How long stored facts are kept before they are fetched again. Awards are
 * given once a year and ratings rarely change.
 */
const factsLifetimeMs = 30 * day;

/** Titles {@link storeTitleFacts} fetches facts for in one run. */
const titlesPerRun = 500;

/** TMDB requests at once; TMDB allows about 50 a second. */
const tmdbConcurrency = 8;

const ExternalIdsSchema = z
	.object({
		imdb_id: z.string().nullish(),
	})
	.optional();

const KeywordSchema = z.object({
	name: z.string(),
});

/** Descriptors are on some countries' ratings only, such as `["Violence", "Fear"]`. */
const DescriptorsSchema = z.array(z.string()).optional();

const ShowFactsSchema = z.object({
	content_ratings: z
		.object({
			results: z.array(
				z.object({
					descriptors: DescriptorsSchema,
					iso_3166_1: z.string(),
					rating: z.string(),
				}),
			),
		})
		.optional(),
	external_ids: ExternalIdsSchema,
	keywords: z
		.object({
			results: z.array(KeywordSchema),
		})
		.optional(),
});

const MovieFactsSchema = z.object({
	external_ids: ExternalIdsSchema,
	keywords: z
		.object({
			keywords: z.array(KeywordSchema),
		})
		.optional(),
	release_dates: z
		.object({
			results: z.array(
				z.object({
					iso_3166_1: z.string(),
					release_dates: z.array(
						z.object({
							certification: z.string(),
							descriptors: DescriptorsSchema,
						}),
					),
				}),
			),
		})
		.optional(),
});

/** What TMDB knows of a title; see `titleFacts`. */
interface TmdbFacts {
	certification: string | null;
	descriptors: string[];
	keywords: string[];
	imdbId: string | null;
}

/** Each name once, trimmed, in the order first given. */
const distinct = (names: readonly string[]) => [
	...new Set(names.flatMap((name) => (name.trim() ? [name.trim()] : []))),
];

/** Asks TMDB once for what the facts take; never stored, since the facts are. */
const factsRequest = {
	maxAgeMs: 0,
	store: false,
};

const fetchShowFacts = async (showId: number): Promise<TmdbFacts | null> => {
	const show = await tmdb(
		`/tv/${showId}`,
		{
			append_to_response: "content_ratings,external_ids,keywords",
		},
		ShowFactsSchema,
		factsRequest,
	);
	if (!show) {
		return null;
	}

	const ratings = show.content_ratings?.results ?? [];
	return {
		certification: ratings.find((rating) => rating.iso_3166_1 === "US")?.rating.trim() || null,
		descriptors: distinct(ratings.flatMap((rating) => rating.descriptors ?? [])),
		imdbId: show.external_ids?.imdb_id || null,
		keywords: distinct(show.keywords?.results.map((keyword) => keyword.name) ?? []),
	};
};

const fetchMovieFacts = async (movieId: number): Promise<TmdbFacts | null> => {
	const movie = await tmdb(
		`/movie/${movieId}`,
		{
			append_to_response: "release_dates,external_ids,keywords",
		},
		MovieFactsSchema,
		factsRequest,
	);
	if (!movie) {
		return null;
	}

	const releases = (movie.release_dates?.results ?? []).flatMap((country) =>
		country.release_dates.map((release) => ({
			...release,
			country: country.iso_3166_1,
		})),
	);
	return {
		certification:
			releases
				.find((release) => release.country === "US" && release.certification.trim())
				?.certification.trim() ?? null,
		descriptors: distinct(releases.flatMap((release) => release.descriptors ?? [])),
		imdbId: movie.external_ids?.imdb_id || null,
		keywords: distinct(movie.keywords?.keywords.map((keyword) => keyword.name) ?? []),
	};
};

/**
 * A title's US certification, every country's rating descriptors, its
 * keywords, and its IMDb ID from TMDB, in one request, or `null` when
 * TMDB does not know the title.
 */
const fetchTmdbFacts = (key: SeriesKey) => {
	const [kind, id] = parseKey(key);
	return kind === "tv" ? fetchShowFacts(id) : fetchMovieFacts(id);
};

/** Titles asked of IMDb in one request. */
const titlesPerImdbRequest = 25;

/** How long IMDb requests wait after the one before. */
const imdbSpacingMs = second;

/** A 429 from IMDb is waited out and retried this many times. */
const imdbRetries = 3;

/**
 * IMDb's GraphQL API, which its own site reads. It is not offered to others
 * and has no documentation, so a change on IMDb's side shows here first as a
 * schema error; nothing else depends on it.
 */
const imdbEndpoint = "https://caching.graphql.imdb.com/";

/** It names the app, never whoever runs it. */
const imdbHeaders = {
	"User-Agent": "Sora/1.0 (self-hosted anime catalogue)",
	"content-type": "application/json",
	"x-imdb-client-name": "imdb-web-next",
};

/**
 * The most nominations IMDb returns for one title. Only long-running
 * Western shows have more, and an anime title rarely has more than a hundred.
 */
const nominationsPerTitle = 250;

const NominationsSchema = z.object({
	awardNominations: z.object({
		edges: z.array(
			z.object({
				node: z.object({
					award: z.object({
						event: z.object({
							text: z.string(),
						}),
						year: z.number().int().nullable(),
					}),
					isWinner: z.boolean(),
				}),
			}),
		),
	}),
});

const ImdbResponseSchema = z.object({
	data: z.record(z.string(), NominationsSchema.nullable()).nullable(),
	errors: z
		.array(
			z.object({
				message: z.string(),
			}),
		)
		.optional(),
});

/**
 * One IMDb GraphQL query for the award nominations of each of `ids` IMDb
 * knows, by the ID asked for, which IMDb may have merged into another.
 *
 * @throws {Error} when IMDb fails or answers with errors alone.
 */
const fetchNominations = async (ids: readonly string[]) => {
	const titles = ids
		.map(
			(id, index) =>
				`t${index}: title(id: ${JSON.stringify(id)}) { awardNominations(first: ${nominationsPerTitle}) { edges { node { isWinner award { year event { text } } } } } }`,
		)
		.join(" ");
	const request = async (retries: number): Promise<Response> => {
		await sleep(imdbSpacingMs);
		const response = await fetch(imdbEndpoint, {
			body: JSON.stringify({
				query: `{ ${titles} }`,
			}),
			headers: imdbHeaders,
			method: "POST",
			signal: AbortSignal.timeout(30 * second),
		});
		if (response.status === 429 && retries > 0) {
			await sleep(parseRetryAfter(response.headers.get("Retry-After")) ?? minute);
			return await request(retries - 1);
		}
		if (!response.ok) {
			throw new Error(`IMDb returned ${response.status}`);
		}
		return response;
	};

	const response = await request(imdbRetries);
	const { data, errors } = ImdbResponseSchema.parse(await response.json());
	if (!data) {
		throw new Error(
			`IMDb answered with errors: ${errors?.map((error) => error.message).join("; ")}`,
		);
	}
	return ids.flatMap((id, index) => {
		const title = data[`t${index}`];
		return title ? [[id, title] as const] : [];
	});
};

/**
 * The country IMDb names some awards with, as in `Academy Awards, USA`,
 * which the award is known without.
 */
const awardCountry = /,\s+\p{Lu}[\p{L}\s.]*$/u;

/** An award's event as IMDb names it, without its country. */
const awardName = (event: string) => event.trim().replace(awardCountry, "");

/**
 * The awards IMDb lists each of `ids` as having won or been nominated for,
 * by IMDb ID: each award once a year as won, and once as nominated for when
 * any of its nominations that year did not win. A title IMDb does not know
 * has none.
 *
 * @throws {Error} when IMDb fails.
 */
const fetchAwards = async (ids: readonly string[]) => {
	const groups = await inSequence(chunked(ids, titlesPerImdbRequest), fetchNominations);
	return new Map(
		groups.flat().map(([id, title]): [string, TitleAward[]] => {
			const awards = new Map<string, TitleAward>();
			for (const { node } of title.awardNominations.edges) {
				const name = awardName(node.award.event.text);
				awards.set(`${name}:${node.award.year}:${node.isWinner}`, {
					name,
					won: node.isWinner,
					year: node.award.year,
				});
			}
			return [id, [...awards.values()]];
		}),
	);
};

/**
 * Stores what TMDB and IMDb say about stored titles TMDB lists (see
 * `titleFacts`): those with none stored first, then those whose are older
 * than {@link factsLifetimeMs}, {@link titlesPerRun} at most. Costs a TMDB
 * request per title and an IMDb request per {@link titlesPerImdbRequest}.
 * A title TMDB fails on is left for the next run.
 *
 * @throws {Error} when IMDb fails; nothing of the run is stored then.
 */
export const storeTitleFacts = async () => {
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
					lt(titleFacts.fetchedAt, new Date(Date.now() - factsLifetimeMs)),
				),
			),
		)
		.orderBy(sql`${titleFacts.fetchedAt} asc nulls first`)
		.limit(titlesPerRun);

	const fetched = new Map<string, TmdbFacts>();
	await inParallel(due, tmdbConcurrency, async ({ key }) => {
		const { data, error } = await attempt(fetchTmdbFacts(key as SeriesKey));
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

	const ids = [...new Set([...fetched.values()].flatMap((facts) => facts.imdbId ?? []))];
	const awards = await fetchAwards(ids);
	const now = new Date();
	const rows = [...fetched].map(([key, facts]) => ({
		awards: (facts.imdbId && awards.get(facts.imdbId)) || [],
		certification: facts.certification,
		descriptors: facts.descriptors,
		fetchedAt: now,
		imdbId: facts.imdbId,
		key,
		keywords: facts.keywords,
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
};
