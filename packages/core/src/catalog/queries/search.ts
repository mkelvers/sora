import { attempt, day, hour, minute, defined } from "@sora/shared";
import { and, asc, desc, eq, inArray, max, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { anilist } from "../../anilist/client";
import { SearchIndexPageDocument } from "../../anilist/graphql.generated";
import type { MediaSort, SearchIndexPageQuery } from "../../anilist/graphql.generated";
import { db } from "../../database/client";
import { animeSearch, catalogSync } from "../../database/schema/catalog";
import { UpstreamUnavailableError } from "../../errors";
import { catalogFormatAllowed } from "../visibility";
import type { BrowseQuery } from "./browse-query";

/**
 * An incremental sync re-reads entries changed this long before the newest
 * one stored, so an entry AniList changed while a sync was paging is not
 * skipped.
 */
const syncOverlapMs = day;

/**
 * Times a sync waits out AniList's rate limit on one page before giving up.
 * A full sync makes hundreds of requests, so it runs into the limit whenever
 * anything else on the host uses AniList meanwhile.
 */
const pageAttempts = 5;

/** Candidates read from the index per search, before ranking. */
const candidateLimit = 300;

/**
 * How similar a title's words must be to the query for the index to offer
 * the entry at all, from 0 to 1. Low enough for a typo in a long title.
 */
const candidateThreshold = 0.45;

type IndexedMedia = NonNullable<
	NonNullable<NonNullable<SearchIndexPageQuery["Page"]>["media"]>[number]
>;

/** AniList serves at most this many pages of 50 for one filter. */
const pagesPerWindow = 100;

/** One page of the catalogue, waiting out AniList's rate limit when it is hit. */
const fetchIndexPage = async (
	page: number,
	sort: MediaSort[],
	popularityBelow: number | undefined,
	tries = 1,
): Promise<SearchIndexPageQuery> => {
	const { data, error } = await attempt(
		anilist(
			SearchIndexPageDocument,
			{
				page,
				popularityBelow,
				sort,
			},
			{
				// Long enough for a failed sync to resume where it stopped.
				maxAgeMs: hour,
			},
		),
		UpstreamUnavailableError,
	);
	if (!error) {
		return data;
	}
	if (tries >= pageAttempts) {
		throw error;
	}

	await Bun.sleep(error.retryAfterMs ?? minute);
	return await fetchIndexPage(page, sort, popularityBelow, tries + 1);
};

/**
 * A title or query reduced for comparison: lowercase letters and digits, with
 * accents, punctuation, and spacing removed or collapsed, so "Re:ZERO",
 * "re zero", and "Re Zero" compare equal.
 */
export const normalizeTitle = (title: string) =>
	title
		.normalize("NFKD")
		.replaceAll(/\p{M}/gu, "")
		.toLowerCase()
		.replaceAll(/[×✕]/gu, " x ")
		.replaceAll(/[^\p{L}\p{N}]+/gu, " ")
		.trim();

/**
 * The year or format AniList puts in parentheses after a title to tell a
 * remake from the original, as in "Hunter x Hunter (2011)" or "JoJo's
 * Bizarre Adventure (TV)". Nobody types it, so it does not count against a
 * match.
 */
const disambiguator = /\s*\((?:\d{4}|TV|OVA|ONA|Movie)\)\s*$/iu;

/**
 * The text the index matches queries against: every title in
 * {@link normalizeTitle}'s form, followed by the initials of each title of
 * two or more words, both with and without a {@link disambiguator}, which
 * {@link textScore} ignores: "ONE PIECE (Movie)" is found by `op` too.
 */
export const searchText = (titles: readonly (string | null)[]) => {
	const normalized = [
		...new Set(titles.flatMap((title) => (title ? [normalizeTitle(title)] : []))),
	].filter((title) => title.length > 0);
	const initials = titles.flatMap((title) =>
		(title ? [title, title.replace(disambiguator, "")] : []).flatMap((spelling) => {
			const words = normalizeTitle(spelling).split(" ");
			return words.length >= 2 ? [words.map((word) => word[0]).join("")] : [];
		}),
	);

	return [...normalized, ...new Set(initials)].join(" | ");
};

const toRow = (media: IndexedMedia): typeof animeSearch.$inferInsert => {
	const english = media.title?.english ?? null;
	const romaji = media.title?.romaji ?? null;
	const native = media.title?.native ?? null;
	const synonyms = (media.synonyms ?? []).flatMap((synonym) =>
		synonym?.trim() ? [synonym.trim()] : [],
	);
	const start = media.startDate;

	return {
		anilistId: media.id,
		averageScore: media.averageScore,
		english,
		format: media.format,
		genres: (media.genres ?? []).flatMap((genre) => (genre ? [genre] : [])),
		isAdult: media.isAdult === true,
		native,
		popularity: media.popularity ?? 0,
		romaji,
		scoreCount:
			media.stats?.scoreDistribution?.reduce((total, bucket) => total + (bucket?.amount ?? 0), 0) ??
			null,
		searchText: searchText([english, romaji, native, ...synonyms]),
		season: media.season,
		seasonYear: media.seasonYear,
		startDate: start?.year
			? [start.year, start.month, start.month ? start.day : null]
					.flatMap((part) => (part ? [String(part).padStart(2, "0")] : []))
					.join("-")
			: null,
		status: media.status,
		synonyms,
		trending: media.trending ?? 0,
		updatedAt: new Date((media.updatedAt ?? 0) * 1000),
	};
};

const toSnakeCase = (name: string) =>
	name.replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`);

/**
 * Stores index rows, rewriting a stored row only when something in it
 * changed: a sync reads thousands of unchanged entries, and each rewrite
 * leaves a dead row and new trigram index entries behind.
 */
const upsert = async (rows: (typeof animeSearch.$inferInsert)[]) => {
	if (rows.length === 0) {
		return 0;
	}

	const keys = Object.keys(rows[0] ?? {}).filter((key) => key !== "anilistId");
	const columns = keys.map(toSnakeCase);
	await db
		.insert(animeSearch)
		.values(rows)
		.onConflictDoUpdate({
			set: Object.fromEntries(keys.map((key) => [key, sql.raw(`excluded.${toSnakeCase(key)}`)])),
			setWhere: sql.raw(
				`(${columns.map((column) => `anime_search.${column}`).join(", ")}) is distinct from (${columns.map((column) => `excluded.${column}`).join(", ")})`,
			),
			target: animeSearch.anilistId,
		});
	return rows.length;
};

/** The search index's row in `catalog_sync`. */
const catalogName = "anime_search";

const markFullSync = async () => {
	const values = {
		fullSyncAt: new Date(),
	};
	await db
		.insert(catalogSync)
		.values({
			catalog: catalogName,
			...values,
		})
		.onConflictDoUpdate({
			set: values,
			target: catalogSync.catalog,
		});
};

/**
 * Brings the search index up to date with AniList.
 *
 * A full sync reads the whole catalogue, most popular first, which also
 * refreshes every entry's popularity; it takes about 400 requests. AniList
 * serves at most 5000 entries for one filter, so the full sync reads the
 * catalogue in windows: each takes up where the last left off, with entries
 * no more popular than the last one read. That one's equals are read again,
 * so none fall between two windows.
 *
 * An incremental sync reads the most recently changed entries until it
 * reaches ones already stored.
 *
 * @returns How many pages were read and how many entries were stored.
 * @throws {UpstreamUnavailableError} when AniList fails; entries
 *   stored before the failure are kept, and a retry resumes from the stored pages.
 */
export const syncSearchIndex = async (options: { full: boolean }) => {
	const [
		{ newest } = {
			newest: null,
		},
	] = await db
		.select({
			newest: max(animeSearch.updatedAt),
		})
		.from(animeSearch);
	const full = options.full || newest === null;
	const cutoff = newest === null ? null : new Date(newest.getTime() - syncOverlapMs);
	const sort: MediaSort[] = full ? ["POPULARITY_DESC", "ID"] : ["UPDATED_AT_DESC"];

	let pages = 0;
	let stored = 0;
	const readWindow = async (
		popularityBelow: number | undefined,
	): Promise<{ pages: number; stored: number }> => {
		let leastPopular: number | undefined;
		const readPage = async (page: number): Promise<{ pages: number; stored: number } | null> => {
			const { Page } = await fetchIndexPage(page, sort, popularityBelow);
			pages += 1;

			const rows = (Page?.media ?? []).flatMap((media) => (media ? [toRow(media)] : []));
			stored += await upsert(rows);
			leastPopular = rows.at(-1)?.popularity ?? leastPopular;

			const isCaughtUp = !full && cutoff !== null && rows.every((row) => row.updatedAt < cutoff);
			if (Page?.pageInfo?.hasNextPage !== true || isCaughtUp) {
				if (full && !isCaughtUp) {
					await markFullSync();
				}

				return {
					pages,
					stored,
				};
			}

			return page >= pagesPerWindow ? null : await readPage(page + 1);
		};

		const finished = await readPage(1);
		if (finished) {
			return finished;
		}

		// An incremental sync that has not caught up after a whole window has
		// fallen too far behind; the weekly full sync covers the rest.
		if (!full) {
			return {
				pages,
				stored,
			};
		}

		const nextBelow = (leastPopular ?? 0) + 1;
		if (popularityBelow !== undefined && nextBelow >= popularityBelow) {
			throw new Error(
				`More than ${pagesPerWindow * 50} anime share popularity ${leastPopular}; the search index cannot page past them`,
			);
		}
		return await readWindow(nextBelow);
	};
	return await readWindow(undefined);
};

/** Once complete, the index is only ever brought up to date, never emptied. */
let isSearchIndexComplete = false;

/**
 * Whether the search index holds the whole catalogue, which it does once a
 * full sync has finished. Until then, searches go to AniList: a partly
 * filled index would miss titles.
 */
export const hasSearchIndex = async () => {
	if (isSearchIndexComplete) {
		return true;
	}

	const [row] = await db
		.select()
		.from(catalogSync)
		.where(eq(catalogSync.catalog, catalogName))
		.limit(1);
	isSearchIndexComplete = row !== undefined;
	return isSearchIndexComplete;
};

/** An indexed entry, as a search ranks it. */
export type SearchCandidate = Pick<
	typeof animeSearch.$inferSelect,
	"anilistId" | "english" | "romaji" | "native" | "synonyms" | "popularity"
>;

/**
 * The index rows the browse filters allow. Adult and short TV entries are
 * excluded. Music videos are returned only when `format` asks for them.
 */
const indexConditions = (filters: Omit<BrowseQuery, "search" | "page" | "perPage">) => {
	const conditions: SQL[] = [
		eq(animeSearch.isAdult, false),
		catalogFormatAllowed(animeSearch.format),
	];
	if (filters.format) {
		conditions.push(inArray(animeSearch.format, filters.format));
	} else {
		// Music videos are not titles to watch; they are found only when asked for.
		conditions.push(sql`${animeSearch.format} is distinct from 'MUSIC'`);
	}
	if (filters.status) {
		conditions.push(eq(animeSearch.status, filters.status));
	}
	if (filters.season) {
		conditions.push(eq(animeSearch.season, filters.season));
	}
	if (filters.seasonYear) {
		conditions.push(eq(animeSearch.seasonYear, filters.seasonYear));
	}
	if (filters.genres?.length) {
		conditions.push(sql`${animeSearch.genres} @> ${JSON.stringify(filters.genres)}::text::jsonb`);
	}
	return conditions;
};

/** The fewest characters the trigram index can find a query by. */
const trigramLength = 3;

/**
 * Matches a normalized query shorter than {@link trigramLength} as a whole
 * word of the search text, or as two words run together, which covers every
 * match {@link textScore} accepts of so short a query: the title itself, a
 * word of it, or its initials, since a word that short allows no typo.
 *
 * The trigram index cannot find such a query, so offering candidates by
 * similarity would score every entry of the index on every keystroke.
 * Normalized text holds only letters, digits, and spaces, none of them
 * special in a pattern.
 */
export const shortQueryPattern = (query: string) => {
	const spellings = [
		query,
		...Array.from(
			{
				length: query.length - 1,
			},
			(_, index) => `${query.slice(0, index + 1)} ${query.slice(index + 1)}`,
		),
	];
	return `(^| )(${spellings.join("|")})( |$)`;
};

/**
 * The fewest letters inserted, removed, replaced, or swapped with their
 * neighbour that turn one word into the other.
 */
const editDistance = (left: string, right: string) => {
	const a = [...left];
	const b = [...right];
	const rows = Array.from(
		{
			length: a.length + 1,
		},
		(_, i) =>
			Array.from(
				{
					length: b.length + 1,
				},
				(_cell, j) => (i === 0 || j === 0 ? Math.max(i, j) : 0),
			),
	);
	for (let i = 1; i <= a.length; i += 1) {
		for (let j = 1; j <= b.length; j += 1) {
			const cost = a[i - 1] === b[j - 1] ? 0 : 1;
			let best = Math.min(
				defined(defined(rows[i - 1])[j]) + 1,
				defined(defined(rows[i])[j - 1]) + 1,
				defined(defined(rows[i - 1])[j - 1]) + cost,
			);
			if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
				best = Math.min(best, defined(defined(rows[i - 2])[j - 2]) + 1);
			}
			defined(rows[i])[j] = best;
		}
	}

	return defined(defined(rows[a.length])[b.length]);
};

/**
 * How many letters of a query word may be wrong: none in a short word, where
 * one letter makes another word, one in a word of five letters or more, and
 * two in one of nine or more.
 */
const allowedTypos = (word: string) => {
	if (word.length >= 9) {
		return 2;
	}
	return word.length >= 5 ? 1 : 0;
};

/**
 * How closely a query resembles a title as a mistyped version of it, from 0
 * to 1: every query word must be a title word with at most
 * {@link allowedTypos} letters wrong, or it is 0. Two words run together
 * count as one, so "rezero" resembles "re zero".
 *
 * Whole words are compared, not letter pairs across the title, so a word
 * that merely shares letters with the query does not match: "frieren" is
 * three edits from "friend", and finds no title about friends.
 */
const resemblance = (queryWords: readonly string[], titleWords: readonly string[]) => {
	const titleTokens = [
		...titleWords,
		...titleWords.slice(1).map((word, index) => `${titleWords[index]}${word}`),
	];

	let total = 0;
	for (const queryWord of queryWords) {
		const typos = Math.min(...titleTokens.map((token) => editDistance(queryWord, token)));
		if (typos > allowedTypos(queryWord)) {
			return 0;
		}

		total += 1 - typos / queryWord.length;
	}

	return total / queryWords.length;
};

/** How well one normalized title matches a normalized query, from 0 to 1. */
export const titleScore = (query: string, title: string) => {
	if (title.length === 0) {
		return 0;
	}
	if (title === query) {
		return 1;
	}

	// Shorter titles are closer to what was typed: "Demon Slayer: Kimetsu no
	// Yaiba" before its film "Demon Slayer: Kimetsu no Yaiba the Movie".
	const closeness = query.length / title.length;
	if (title.startsWith(`${query} `)) {
		return 0.95 + 0.03 * closeness;
	}

	const titleWords = title.split(" ");
	const queryWords = query.split(" ");
	if (queryWords.every((word) => titleWords.includes(word))) {
		return 0.9 + 0.03 * closeness;
	}

	if (
		titleWords.length >= 2 &&
		!query.includes(" ") &&
		titleWords.map((word) => word[0]).join("") === query
	) {
		return 0.85;
	}

	return 0.8 * resemblance(queryWords, titleWords);
};

/** How well the best of an entry's titles matches a normalized query, from 0 to 1. */
export const textScore = (query: string, candidate: SearchCandidate) => {
	const titles = [
		...[candidate.english, candidate.romaji, candidate.native].map((title) => ({
			title,
			weight: 1,
		})),
		...candidate.synonyms.map((title) => ({
			title,
			weight: 0.9,
		})),
	];

	// With and without the disambiguator: "oreimo 2" and "oreimo 2 ona" both
	// name "Oreimo 2 (ONA)".
	return Math.max(
		0,
		...titles.flatMap(({ title, weight }) =>
			title
				? [title, title.replace(disambiguator, "")].map(
						(spelling) => weight * titleScore(query, normalizeTitle(spelling)),
					)
				: [],
		),
	);
};

/**
 * The least {@link textScore} a result must reach: a typo in a title passes,
 * a title that merely shares some letters with the query does not.
 */
const minimumMatch = 0.5;

type IndexedRow = typeof animeSearch.$inferSelect;

const sortOrders: Record<
	NonNullable<BrowseQuery["sort"]>,
	(left: IndexedRow, right: IndexedRow) => number
> = {
	newest: (left, right) =>
		(right.startDate ?? "").localeCompare(left.startDate ?? "") ||
		right.popularity - left.popularity,
	popular: (left, right) => right.popularity - left.popularity,
	score: (left, right) =>
		(right.averageScore ?? -1) - (left.averageScore ?? -1) || right.popularity - left.popularity,
	title: (left, right) => (left.romaji ?? "").localeCompare(right.romaji ?? ""),
	trending: (left, right) => right.trending - left.trending || right.popularity - left.popularity,
};

/**
 * Weighs a match by popularity, from 0.4 for an entry nobody lists to 1 for
 * one with about 1.6 million AniList users, the most any has, on a
 * logarithmic scale. It spans more than the gaps between kinds of title
 * match, so a show three times as popular wins over a slightly closer title:
 * "evangelion" finds Neon Genesis Evangelion before the Rebuild films.
 */
export const popularityWeight = (popularity: number) =>
	0.4 + 0.6 * Math.min(1, Math.log10(Math.max(0, popularity) + 1) / 6.2);

/**
 * Orders candidates by how well they answer a query: how closely one of
 * their titles matches it, weighed by how popular they are.
 *
 * A title that is the query scores highest, then one that starts with it,
 * then one containing all its words, then one whose initials it is, then one
 * that merely resembles it, as with a typo. Synonyms count a little less than
 * the English, romaji, and native titles, since AniList lists loose ones:
 * "Demon Slayer" is a synonym of the short film Onigiri.
 *
 * Popularity decides between titles that match about equally well, so the
 * show a query is almost always after comes first, and a close match to an
 * obscure title does not bury a slightly looser match to a famous one.
 */
export const rankCandidates = <TCandidate extends SearchCandidate>(
	query: string,
	candidates: readonly TCandidate[],
) => {
	const normalized = normalizeTitle(query);
	return candidates
		.map((candidate) => ({
			candidate,
			score: textScore(normalized, candidate) * popularityWeight(candidate.popularity),
		}))
		.toSorted(
			(left, right) =>
				right.score - left.score || right.candidate.popularity - left.candidate.popularity,
		)
		.map(({ candidate }) => candidate);
};

/**
 * Finds the AniList entries that best match a query, best first, applying
 * the browse filters. Adult entries and short TV series are never
 * returned. Music videos are returned only when `format` asks for them.
 *
 * Candidates come from the index by trigram similarity, which forgives typos
 * and word order; a query too short for trigrams is matched as a word, see
 * {@link shortQueryPattern}. Those whose titles match well enough are ranked
 * by {@link rankCandidates}, or ordered by `sort` when one is given.
 */
export const searchAnime = async (
	query: string,
	filters: Omit<BrowseQuery, "search" | "page" | "perPage"> = {},
) => {
	const normalized = normalizeTitle(query);
	if (normalized.length === 0) {
		return [];
	}

	const conditions = indexConditions(filters);

	const isShort = normalized.length < trigramLength;
	const candidates = await db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`set local pg_trgm.word_similarity_threshold = ${candidateThreshold}`),
		);
		return tx
			.select()
			.from(animeSearch)
			.where(
				and(
					...conditions,
					isShort
						? sql`${animeSearch.searchText} ~ ${shortQueryPattern(normalized)}`
						: sql`(${animeSearch.searchText} %> ${normalized} or ${animeSearch.searchText} like ${`%${normalized.replaceAll(/[\\%_]/gu, (character) => `\\${character}`)}%`})`,
				),
			)
			.orderBy(
				desc(sql`word_similarity(${normalized}, ${animeSearch.searchText})`),
				desc(animeSearch.popularity),
			)
			.limit(candidateLimit);
	});

	// The index offers anything faintly alike; only real matches are results.
	const matches = candidates.filter(
		(candidate) => textScore(normalized, candidate) >= minimumMatch,
	);
	return filters.sort
		? [...matches].toSorted(sortOrders[filters.sort])
		: rankCandidates(query, matches);
};

/** How {@link browseIndex} orders each `sort`, the entry's ID last so pages stay put. */
const indexOrders: Record<NonNullable<BrowseQuery["sort"]>, SQL[]> = {
	newest: [sql`${animeSearch.startDate} desc nulls last`, desc(animeSearch.popularity)],
	popular: [desc(animeSearch.popularity)],
	score: [sql`${animeSearch.averageScore} desc nulls last`, desc(animeSearch.popularity)],
	title: [sql`${animeSearch.romaji} asc nulls last`],
	trending: [desc(animeSearch.trending), desc(animeSearch.popularity)],
};

/**
 * Lists the first `limit` AniList entries of the index, ordered by `sort`
 * (trending when omitted) and filtered like {@link searchAnime}, and by
 * `where` when given. Reads only the database, so browsing never waits on
 * AniList or its rate limit.
 */
export const browseIndex = async (
	filters: Omit<BrowseQuery, "search" | "page" | "perPage">,
	limit: number,
	where?: SQL,
) =>
	await db
		.select()
		.from(animeSearch)
		.where(and(...indexConditions(filters), where))
		.orderBy(...indexOrders[filters.sort ?? "trending"], asc(animeSearch.anilistId))
		.limit(limit);
