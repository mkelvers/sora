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

/** The most entities Wikidata's `wbgetentities` returns to one request. */
const entitiesPerRequest = 50;

/**
 * Wikimedia turns away requests without a `User-Agent` that names the
 * client. It names the app, never whoever runs it.
 */
const wikidataHeaders = {
	"User-Agent": "Sora/1.0 (self-hosted anime catalogue)",
};

/** How long Wikidata requests wait after the one before. */
const wikidataSpacingMs = second;

/** A 429 from Wikidata is waited out and retried this many times. */
const wikidataRetries = 3;

const ExternalIdsSchema = z
	.object({
		wikidata_id: z.string().nullish(),
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
	wikidataId: string | null;
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
		keywords: distinct(show.keywords?.results.map((keyword) => keyword.name) ?? []),
		wikidataId: show.external_ids?.wikidata_id || null,
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
		keywords: distinct(movie.keywords?.keywords.map((keyword) => keyword.name) ?? []),
		wikidataId: movie.external_ids?.wikidata_id || null,
	};
};

/**
 * A title's US certification, every country's rating descriptors, its
 * keywords, and its Wikidata item from TMDB, in one request, or `null` when
 * TMDB does not know the title.
 */
const fetchTmdbFacts = (key: SeriesKey) => {
	const [kind, id] = parseKey(key);
	return kind === "tv" ? fetchShowFacts(id) : fetchMovieFacts(id);
};

const SnakSchema = z.object({
	datavalue: z
		.object({
			value: z.unknown(),
		})
		.optional(),
});

const ItemValueSchema = z.object({
	id: z.string(),
});

const TimeValueSchema = z.object({
	time: z.string(),
});

const StatementSchema = z.object({
	mainsnak: SnakSchema,
	qualifiers: z.record(z.string(), z.array(SnakSchema)).optional(),
});

const EntitiesSchema = z.object({
	entities: z.record(
		z.string(),
		z.object({
			claims: z.record(z.string(), z.array(StatementSchema)).optional(),
			labels: z
				.record(
					z.string(),
					z.object({
						value: z.string(),
					}),
				)
				.optional(),
		}),
	),
});

/**
 * Wikidata entities by ID, `props` of each.
 *
 * @throws {Error} when Wikidata fails.
 */
const fetchEntities = async (ids: readonly string[], props: "claims" | "labels") => {
	const url = new URL("https://www.wikidata.org/w/api.php");
	url.search = new URLSearchParams({
		action: "wbgetentities",
		format: "json",
		ids: ids.join("|"),
		languages: "en",
		props,
	}).toString();
	const request = async (retries: number): Promise<Response> => {
		// One request at a time, a second apart, as Wikimedia asks of bots.
		await sleep(wikidataSpacingMs);
		const response = await fetch(url, {
			headers: wikidataHeaders,
			signal: AbortSignal.timeout(15 * second),
		});
		if (response.status === 429 && retries > 0) {
			await sleep(parseRetryAfter(response.headers.get("Retry-After")) ?? minute);
			return await request(retries - 1);
		}
		if (!response.ok) {
			throw new Error(`Wikidata returned ${response.status}`);
		}
		return response;
	};

	const response = await request(wikidataRetries);
	return EntitiesSchema.parse(await response.json()).entities;
};

/** Wikidata's properties for an award a work won (`P166`) and one it was nominated for (`P1411`). */
const awardProperties = {
	P1411: false,
	P166: true,
} as const;

/** Wikidata's qualifier for when an award was given (`P585`, point in time). */
const pointInTime = "P585";

/**
 * Names that are an award's own. Works on Wikidata are also credited as
 * having "received" companies, conventions, magazines, and generic kinds of
 * award ("anime award"), none of which name an award in capitals.
 */
const awardName = /\b(?:Awards?|Prize|Grand Prix)\b/u;

/** An award statement before its award is named. */
interface AwardStatement {
	item: string;
	awardId: string;
	won: boolean;
	year: number | null;
}

const yearOf = (snak: z.infer<typeof SnakSchema> | undefined) => {
	const parsed = TimeValueSchema.safeParse(snak?.datavalue?.value);
	const year = parsed.success
		? Number(/^[+-]?(?<year>\d{4})/u.exec(parsed.data.time)?.[1])
		: Number.NaN;
	return Number.isInteger(year) ? year : null;
};

/** The award statements of each of `items`, a request per {@link entitiesPerRequest}. */
const fetchAwardStatements = async (items: readonly string[]) => {
	const groups = await inSequence(chunked(items, entitiesPerRequest), async (group) => {
		const entities = await fetchEntities(group, "claims");
		return group.flatMap((item) =>
			Object.entries(awardProperties).flatMap(([property, won]) =>
				(entities[item]?.claims?.[property] ?? []).flatMap((statement): AwardStatement[] => {
					const award = ItemValueSchema.safeParse(statement.mainsnak.datavalue?.value);
					return award.success
						? [
								{
									awardId: award.data.id,
									item,
									won,
									year: yearOf(statement.qualifiers?.[pointInTime]?.[0]),
								},
							]
						: [];
				}),
			),
		);
	});
	return groups.flat();
};

/** The English names of the awards among `ids` that are named as one (see {@link awardName}). */
const fetchAwardNames = async (ids: readonly string[]) => {
	const groups = await inSequence(chunked(ids, entitiesPerRequest), async (group) => {
		const entities = await fetchEntities(group, "labels");
		return Object.entries(entities).flatMap(([id, entity]) => {
			const name = entity.labels?.en?.value.trim();
			return name && awardName.test(name) ? [[id, name] as const] : [];
		});
	});
	return new Map(groups.flat());
};

/**
 * The awards Wikidata says each of `items` won or was nominated for, by
 * item, each named in English. Statements whose award is not named as an
 * award (see {@link awardName}) are left out, and so are repeats.
 *
 * @throws {Error} when Wikidata fails.
 */
const fetchAwards = async (items: readonly string[]) => {
	const statements = await fetchAwardStatements(items);
	const names = await fetchAwardNames([
		...new Set(statements.map((statement) => statement.awardId)),
	]);

	const awards = new Map<string, Map<string, TitleAward>>();
	for (const { item, awardId, won, year } of statements) {
		const name = names.get(awardId);
		if (name) {
			const own = awards.get(item) ?? new Map<string, TitleAward>();
			own.set(`${name}:${year}:${won}`, {
				name,
				won,
				year,
			});
			awards.set(item, own);
		}
	}

	return new Map([...awards].map(([item, own]) => [item, [...own.values()]]));
};

/**
 * Stores what TMDB and Wikidata say about stored titles TMDB lists (see
 * `titleFacts`): those with none stored first, then those whose are older
 * than {@link factsLifetimeMs}, {@link titlesPerRun} at most. Costs a TMDB
 * request per title and a few Wikidata requests per run. A title TMDB fails
 * on is left for the next run.
 *
 * @throws {Error} when Wikidata fails; nothing of the run is stored then.
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
				keywords: [],
				wikidataId: null,
			},
		);
	});

	const items = [...new Set([...fetched.values()].flatMap((facts) => facts.wikidataId ?? []))];
	const awards = await fetchAwards(items);
	const now = new Date();
	const rows = [...fetched].map(([key, facts]) => ({
		awards: (facts.wikidataId && awards.get(facts.wikidataId)) || [],
		certification: facts.certification,
		descriptors: facts.descriptors,
		fetchedAt: now,
		key,
		keywords: facts.keywords,
		wikidataId: facts.wikidataId,
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
					keywords: sql`excluded.keywords`,
					wikidataId: sql`excluded.wikidata_id`,
				},
				target: titleFacts.key,
			});
	}

	return {
		awarded: rows.filter((row) => row.awards.length > 0).length,
		stored: rows.length,
	};
};
