import { day } from "@sora/shared";
import { and, asc, desc, eq, max, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { db } from "../../database/client";
import { animeSearch, fullSync } from "../../database/schema/catalog";
import type { BrowseQuery } from "./browse-query";
import { Filters } from "./filters";
import { catalogName, Sync } from "./sync";
import { disambiguator, normalize } from "./titles";
import { Word } from "./word";

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
export const syncAnime = async (options: { full: boolean }) => {
	/**
	 * An incremental sync re-reads entries changed this long before the newest
	 * one stored, so an entry AniList changed while a sync was paging is not
	 * skipped.
	 */
	const syncOverlapMs = day;

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
	let cutoff: Date | null = null;

	if (newest !== null) {
		cutoff = new Date(newest.getTime() - syncOverlapMs);
	}

	const sync = new Sync(full, cutoff);

	return await sync.window(undefined);
};

/** Whether the search index is complete; once it is, it is only ever brought up to date, never emptied. */
class SearchIndex {
	#complete = false;

	/**
	 * Whether the search index holds the whole catalogue, which it does once a
	 * full sync has finished. Until then, searches go to AniList: a partly
	 * filled index would miss titles.
	 */
	async complete() {
		if (this.#complete) {
			return true;
		}

		const [row] = await db
			.select()
			.from(fullSync)
			.where(eq(fullSync.catalog, catalogName))
			.limit(1);

		this.#complete = row !== undefined;

		return this.#complete;
	}
}

export const animeIndex = new SearchIndex();

/** An indexed entry, as a search ranks it. */
export type SearchCandidate = Pick<
	typeof animeSearch.$inferSelect,
	"anilistId" | "english" | "romaji" | "native" | "synonyms" | "popularity"
>;

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

	const acronym =
		titleWords.length >= 2 &&
		!query.includes(" ") &&
		titleWords.map((word) => word[0]).join("") === query;

	if (acronym) {
		return 0.85;
	}

	// How closely the query resembles the title as a mistyped version of it,
	// from 0 to 1: every query word must be a title word with at most its
	// tolerance of letters wrong, or it is 0. Two words run together count as
	// one, so "rezero" resembles "re zero". Whole words are compared, not
	// letter pairs across the title, so a word that merely shares letters with
	// the query does not match: "frieren" is three edits from "friend", and
	// finds no title about friends.
	const titleTokens = [
		...titleWords,
		...titleWords.slice(1).map((word, index) => `${titleWords[index]}${word}`),
	];

	let total = 0;

	for (const queryWord of queryWords) {
		const word = new Word(queryWord);
		const typos = Math.min(...titleTokens.map((token) => word.distance(token)));

		if (typos > word.tolerance) {
			return 0;
		}

		total += 1 - typos / queryWord.length;
	}

	return 0.8 * (total / queryWords.length);
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
		...titles.flatMap(({ title, weight }) => {
			if (title) {
				return [title, title.replace(disambiguator, "")].map(
					(spelling) => weight * titleScore(query, normalize(spelling)),
				);
			}

			return [];
		}),
	);
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
	const normalized = normalize(query);

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
export const findAnime = async (
	query: string,
	filters: Omit<BrowseQuery, "search" | "page" | "perPage"> = {},
) => {
	/**
	 * The least {@link textScore} a result must reach: a typo in a title passes,
	 * a title that merely shares some letters with the query does not.
	 */
	const minimumMatch = 0.5;

	/** The fewest characters the trigram index can find a query by. */
	const trigramLength = 3;

	/**
	 * How similar a title's words must be to the query for the index to offer
	 * the entry at all, from 0 to 1. Low enough for a typo in a long title.
	 */
	const candidateThreshold = 0.45;

	/** Candidates read from the index per search, before ranking. */
	const candidateLimit = 300;

	/** How each `sort` orders the matches. */
	const sortOrders: Record<
		NonNullable<BrowseQuery["sort"]>,
		(left: typeof animeSearch.$inferSelect, right: typeof animeSearch.$inferSelect) => number
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

	const normalized = normalize(query);

	if (normalized.length === 0) {
		return [];
	}

	const { conditions } = new Filters(filters);

	const isShort = normalized.length < trigramLength;
	let match = sql`(${animeSearch.searchText} %> ${normalized} or ${animeSearch.searchText} like ${`%${normalized.replaceAll(/[\\%_]/gu, (character) => `\\${character}`)}%`})`;

	if (isShort) {
		match = sql`${animeSearch.searchText} ~ ${shortQueryPattern(normalized)}`;
	}

	const candidates = await db.transaction(async (tx) => {
		await tx.execute(
			sql.raw(`set local pg_trgm.word_similarity_threshold = ${candidateThreshold}`),
		);

		return tx
			.select()
			.from(animeSearch)
			.where(and(...conditions, match))
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

	if (filters.sort) {
		return [...matches].toSorted(sortOrders[filters.sort]);
	}

	return rankCandidates(query, matches);
};

/**
 * Lists the first `limit` AniList entries of the index, ordered by `sort`
 * (trending when omitted) and filtered like {@link findAnime}, and by
 * `where` when given. Reads only the database, so browsing never waits on
 * AniList or its rate limit.
 */
export const browseIndex = async (
	filters: Omit<BrowseQuery, "search" | "page" | "perPage">,
	limit: number,
	where?: SQL,
) => {
	/** How each `sort` orders the entries, the entry's ID last so pages stay put. */
	const orders: Record<NonNullable<BrowseQuery["sort"]>, SQL[]> = {
		newest: [sql`${animeSearch.startDate} desc nulls last`, desc(animeSearch.popularity)],
		popular: [desc(animeSearch.popularity)],
		score: [sql`${animeSearch.averageScore} desc nulls last`, desc(animeSearch.popularity)],
		title: [sql`${animeSearch.romaji} asc nulls last`],
		trending: [desc(animeSearch.trending), desc(animeSearch.popularity)],
	};

	return await db
		.select()
		.from(animeSearch)
		.where(and(...new Filters(filters).conditions, where))
		.orderBy(...orders[filters.sort ?? "trending"], asc(animeSearch.anilistId))
		.limit(limit);
};
