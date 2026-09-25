import { diceSimilarity } from "anime-sdk";
import { and, desc, eq, inArray, max, sql, type SQL } from "drizzle-orm";

import { anilist } from "../../anilist/client";
import { SearchIndexPageDocument, type MediaSort, type SearchIndexPageQuery } from "../../anilist/graphql.generated";
import { db } from "../../database/client";
import { UpstreamUnavailableError } from "../../errors";
import { animeSearch, catalogSync } from "../../database/schema";
import { day, hour, minute } from "../../time";
import type { BrowseQuery } from "./browse";

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

type IndexedMedia = NonNullable<NonNullable<NonNullable<SearchIndexPageQuery["Page"]>["media"]>[number]>;

/** AniList serves at most this many pages of 50 for one filter. */
const pagesPerWindow = 100;

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
 * @throws {@link UpstreamUnavailableError} when AniList fails; entries
 *   stored before the failure are kept, and a retry resumes from cached pages.
 */
export async function syncSearchIndex(options: { full: boolean }) {
  const [{ newest } = { newest: null }] = await db
    .select({
      newest: max(animeSearch.updatedAt)
    })
    .from(animeSearch);
  const full = options.full || newest === null;
  const cutoff = newest === null ? null : new Date(newest.getTime() - syncOverlapMs);
  const sort: MediaSort[] = full ? ["POPULARITY_DESC", "ID"] : ["UPDATED_AT_DESC"];

  let pages = 0;
  let stored = 0;
  let popularityBelow: number | undefined;
  for (;;) {
    let leastPopular: number | undefined;
    for (let page = 1; page <= pagesPerWindow; page += 1) {
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
          stored
        };
      }
    }

    // An incremental sync that has not caught up after a whole window has
    // fallen too far behind; the weekly full sync covers the rest.
    if (!full) {
      return {
        pages,
        stored
      };
    }

    const nextBelow = (leastPopular ?? 0) + 1;
    if (popularityBelow !== undefined && nextBelow >= popularityBelow) {
      throw new Error(`More than ${pagesPerWindow * 50} anime share popularity ${leastPopular}; the search index cannot page past them`);
    }
    popularityBelow = nextBelow;
  }
}

/** One page of the catalogue, waiting out AniList's rate limit when it is hit. */
async function fetchIndexPage(page: number, sort: MediaSort[], popularityBelow: number | undefined) {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await anilist(
        SearchIndexPageDocument,
        {
          page,
          sort,
          popularityBelow
        },
        {
          // Long enough for a failed sync to resume where it stopped.
          maxAgeMs: hour
        }
      );
    } catch (error) {
      if (!(error instanceof UpstreamUnavailableError) || attempt >= pageAttempts) {
        throw error;
      }

      await Bun.sleep(error.retryAfterMs ?? minute);
    }
  }
}

function toRow(media: IndexedMedia): typeof animeSearch.$inferInsert {
  const english = media.title?.english ?? null;
  const romaji = media.title?.romaji ?? null;
  const native = media.title?.native ?? null;
  const synonyms = (media.synonyms ?? []).flatMap((synonym) => (synonym?.trim() ? [synonym.trim()] : []));
  const start = media.startDate;

  return {
    anilistId: media.id,
    english,
    romaji,
    native,
    synonyms,
    searchText: searchText([english, romaji, native, ...synonyms]),
    format: media.format,
    status: media.status,
    season: media.season,
    seasonYear: media.seasonYear,
    startDate: start?.year
      ? [start.year, start.month, start.month ? start.day : null]
          .flatMap((part) => (part ? [String(part).padStart(2, "0")] : []))
          .join("-")
      : null,
    genres: (media.genres ?? []).flatMap((genre) => (genre ? [genre] : [])),
    popularity: media.popularity ?? 0,
    trending: media.trending ?? 0,
    averageScore: media.averageScore,
    isAdult: media.isAdult === true,
    updatedAt: new Date((media.updatedAt ?? 0) * 1_000)
  };
}

async function upsert(rows: (typeof animeSearch.$inferInsert)[]) {
  if (rows.length === 0) {
    return 0;
  }

  await db
    .insert(animeSearch)
    .values(rows)
    .onConflictDoUpdate({
      target: animeSearch.anilistId,
      set: Object.fromEntries(
        Object.keys(rows[0] ?? {}).flatMap((key) =>
          key === "anilistId" ? [] : [[key, sql.raw(`excluded.${toSnakeCase(key)}`)]]
        )
      )
    });
  return rows.length;
}

function toSnakeCase(name: string) {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * The text the index matches queries against: every title in
 * {@link normalizeTitle}'s form, followed by the initials of each title of
 * two or more words.
 */
export function searchText(titles: readonly (string | null)[]) {
  const normalized = [...new Set(titles.flatMap((title) => (title ? [normalizeTitle(title)] : [])))].filter(
    (title) => title.length > 0
  );
  const initials = normalized.flatMap((title) => {
    const words = title.split(" ");
    return words.length >= 2 ? [words.map((word) => word[0]).join("")] : [];
  });

  return [...normalized, ...new Set(initials)].join(" | ");
}

/**
 * A title or query reduced for comparison: lowercase letters and digits, with
 * accents, punctuation, and spacing removed or collapsed, so "Re:ZERO",
 * "re zero", and "Re Zero" compare equal.
 */
export function normalizeTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[×✕]/g, " x ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** The search index's row in `catalog_sync`. */
const catalogName = "anime_search";

async function markFullSync() {
  const values = {
    fullSyncAt: new Date()
  };
  await db
    .insert(catalogSync)
    .values({
      catalog: catalogName,
      ...values
    })
    .onConflictDoUpdate({
      target: catalogSync.catalog,
      set: values
    });
}

/**
 * Whether the search index holds the whole catalogue, which it does once a
 * full sync has finished. Until then, searches go to AniList: a partly
 * filled index would miss titles.
 */
export async function hasSearchIndex() {
  if (isSearchIndexComplete) {
    return true;
  }

  const [row] = await db.select().from(catalogSync).where(eq(catalogSync.catalog, catalogName)).limit(1);
  isSearchIndexComplete = row !== undefined;
  return isSearchIndexComplete;
}

/** Once complete, the index is only ever brought up to date, never emptied. */
let isSearchIndexComplete = false;

/** An indexed entry, as a search ranks it. */
export type SearchCandidate = Pick<
  typeof animeSearch.$inferSelect,
  "anilistId" | "english" | "romaji" | "native" | "synonyms" | "popularity"
>;

/**
 * Finds the AniList entries that best match a query, best first, applying
 * the browse filters. Adult entries are never returned, and music videos
 * only when `format` asks for them.
 *
 * Candidates come from the index by trigram similarity, which forgives typos
 * and word order. Those whose titles match well enough are ranked by
 * {@link rankCandidates}, or ordered by `sort` when one is given.
 */
export async function searchAnime(query: string, filters: Omit<BrowseQuery, "search" | "page" | "perPage"> = {}) {
  const normalized = normalizeTitle(query);
  if (normalized.length === 0) {
    return [];
  }

  const conditions: SQL[] = [eq(animeSearch.isAdult, false)];
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
    conditions.push(sql`${animeSearch.genres} @> ${JSON.stringify(filters.genres)}::jsonb`);
  }

  const candidates = await db.transaction(async (tx) => {
    await tx.execute(sql.raw(`set local pg_trgm.word_similarity_threshold = ${candidateThreshold}`));
    return tx
      .select()
      .from(animeSearch)
      .where(
        and(
          ...conditions,
          sql`(${animeSearch.searchText} %> ${normalized} or ${animeSearch.searchText} like ${`%${escapeLike(normalized)}%`})`
        )
      )
      .orderBy(desc(sql`word_similarity(${normalized}, ${animeSearch.searchText})`), desc(animeSearch.popularity))
      .limit(candidateLimit);
  });

  // The index offers anything faintly alike; only real matches are results.
  const matches = candidates.filter((candidate) => textScore(normalized, candidate) >= minimumMatch);
  return filters.sort ? [...matches].sort(sortOrders[filters.sort]) : rankCandidates(query, matches);
}

/**
 * The least {@link textScore} a result must reach: a typo in a title passes,
 * a title that merely shares some letters with the query does not.
 */
const minimumMatch = 0.5;

function escapeLike(text: string) {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}

type IndexedRow = typeof animeSearch.$inferSelect;

const sortOrders: Record<NonNullable<BrowseQuery["sort"]>, (left: IndexedRow, right: IndexedRow) => number> = {
  trending: (left, right) => right.trending - left.trending || right.popularity - left.popularity,
  popular: (left, right) => right.popularity - left.popularity,
  score: (left, right) => (right.averageScore ?? -1) - (left.averageScore ?? -1) || right.popularity - left.popularity,
  newest: (left, right) =>
    (right.startDate ?? "").localeCompare(left.startDate ?? "") || right.popularity - left.popularity,
  title: (left, right) => (left.romaji ?? "").localeCompare(right.romaji ?? "")
};

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
export function rankCandidates<TCandidate extends SearchCandidate>(query: string, candidates: readonly TCandidate[]) {
  const normalized = normalizeTitle(query);
  return candidates
    .map((candidate) => ({
      candidate,
      score: textScore(normalized, candidate) * popularityWeight(candidate.popularity)
    }))
    .sort((left, right) => right.score - left.score || right.candidate.popularity - left.candidate.popularity)
    .map(({ candidate }) => candidate);
}

/** How well the best of an entry's titles matches a normalized query, from 0 to 1. */
export function textScore(query: string, candidate: SearchCandidate) {
  const titles = [
    ...[candidate.english, candidate.romaji, candidate.native].map((title) => ({
      title,
      weight: 1
    })),
    ...candidate.synonyms.map((title) => ({
      title,
      weight: 0.9
    }))
  ];

  return Math.max(
    0,
    ...titles.flatMap(({ title, weight }) =>
      title ? [weight * titleScore(query, normalizeTitle(title.replace(disambiguator, "")))] : []
    )
  );
}

/**
 * The year or format AniList puts in parentheses after a title to tell a
 * remake from the original, as in "Hunter x Hunter (2011)" or "JoJo's
 * Bizarre Adventure (TV)". Nobody types it, so it does not count against a
 * match.
 */
const disambiguator = /\s*\((?:\d{4}|TV|OVA|ONA|Movie)\)\s*$/i;

/** How well one normalized title matches a normalized query, from 0 to 1. */
export function titleScore(query: string, title: string) {
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

  if (titleWords.length >= 2 && !query.includes(" ") && titleWords.map((word) => word[0]).join("") === query) {
    return 0.85;
  }

  return 0.8 * resemblance(query, titleWords);
}

/**
 * How closely a query resembles a title or a run of its words of about the
 * query's length, so a typo in the first words of a long title still counts.
 */
function resemblance(query: string, titleWords: readonly string[]) {
  const queryWordCount = query.split(" ").length;
  let best = diceSimilarity(query, titleWords.join(" "));
  for (let start = 0; start < titleWords.length; start += 1) {
    const window = titleWords.slice(start, start + queryWordCount).join(" ");
    best = Math.max(best, diceSimilarity(query, window));
  }

  return best;
}

/**
 * Weighs a match by popularity, from 0.4 for an entry nobody lists to 1 for
 * one with about 1.6 million AniList users, the most any has, on a
 * logarithmic scale. It spans more than the gaps between kinds of title
 * match, so a show three times as popular wins over a slightly closer title:
 * "evangelion" finds Neon Genesis Evangelion before the Rebuild films.
 */
export function popularityWeight(popularity: number) {
  return 0.4 + 0.6 * Math.min(1, Math.log10(Math.max(0, popularity) + 1) / 6.2);
}

