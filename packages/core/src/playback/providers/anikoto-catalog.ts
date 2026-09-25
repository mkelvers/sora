import { bestSimilarity, type HttpClient } from "anime-sdk";
import { and, eq, gte, inArray, lte, max, notInArray, or, sql } from "drizzle-orm";
import { z } from "zod";

import type { Anime, AnimeFormat } from "../../catalog/models/anime";
import { getAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { anikotoSeries } from "../../database/schema";
import { day } from "../../time";

const apiUrl = "https://anikotoapi.site";
const siteUrl = "https://anikototv.to";

/** Search results fetched per title when the mirror has no match. */
const lookupCandidateLimit = 6;

/** How many prequels back a part may continue its series' AniKoto episodes. */
const continuationDepth = 3;

/**
 * An incremental sync re-reads series changed this long before the newest
 * one stored, so a series AniKoto updated while a sync was paging through
 * its catalogue is not skipped.
 */
const syncOverlapMs = day;

/** An ID field AniKoto sends as a number, a numeric string, or an empty string. */
const OptionalIdSchema = z
  .union([z.number(), z.string()])
  .nullish()
  .transform((value) => {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  });

/** One series in AniKoto's catalogue listing. */
const CatalogSeriesSchema = z.object({
  id: z.number().int().positive(),
  title: z.string().min(1),
  alternative: z.string().nullish(),
  /** Other titles, joined with commas, which titles themselves may contain. */
  titles: z.string().nullish(),
  native: z.string().nullish(),
  ani_id: OptionalIdSchema,
  mal_id: OptionalIdSchema,
  year: OptionalIdSchema,
  episodes: OptionalIdSchema,
  terms_by_type: z
    .object({
      type: z.array(z.string()).optional()
    })
    .nullish(),
  /** `YYYY-MM-DD hh:mm:ss`, in UTC. */
  updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
});

/** AniKoto's series endpoint; the series itself is read by {@link parseCatalogSeries}. */
const SeriesResponseSchema = z.object({
  data: z.object({
    anime: z.unknown()
  })
});

const CatalogPageSchema = z.object({
  data: z.array(z.unknown()),
  pagination: z.object({
    page: z.number().int(),
    total_pages: z.number().int().nonnegative()
  })
});

/** AniKoto's series types, as AniList formats. */
const formats: Record<string, AnimeFormat> = {
  tv: "TV",
  tv_short: "TV_SHORT",
  "tv short": "TV_SHORT",
  movie: "MOVIE",
  ova: "OVA",
  ona: "ONA",
  special: "SPECIAL",
  "tv special": "SPECIAL",
  music: "MUSIC"
};

/** Formats one site may list as another: a TV short as TV, a web series as TV or OVA. */
const episodicFormats = new Set<string>(["TV", "TV_SHORT", "ONA"]);
const extraFormats = new Set<string>(["OVA", "SPECIAL", "ONA"]);

/**
 * Mirrors AniKoto's catalogue into `anikoto_series`.
 *
 * AniKoto lists its catalogue newest change first. An incremental sync stops
 * at the first page older than what is stored; a full sync reads every page
 * and then drops series AniKoto no longer lists. A series that fails to parse
 * is skipped rather than failing its page, and then nothing is dropped.
 *
 * @param options.full - Read the whole catalogue, as when it was never synced.
 * @returns How many pages were read and how many series were stored.
 * @throws when AniKoto's API fails; series stored before the failure are kept.
 */
export async function syncAniKotoCatalog(
  http: HttpClient,
  options: {
    full: boolean;
    signal?: AbortSignal;
  }
) {
  const [{ newest } = { newest: null }] = await db
    .select({
      newest: max(anikotoSeries.updatedAt)
    })
    .from(anikotoSeries);
  const full = options.full || newest === null;
  const cutoff = newest === null ? null : new Date(newest.getTime() - syncOverlapMs);

  const seen: number[] = [];
  let isEverySeriesRead = true;
  let pages = 0;
  let stored = 0;
  for (let page = 1; ; page += 1) {
    const response = await http.get(`${apiUrl}/recent-anime?page=${page}`, {
      signal: options.signal
    });
    const listing = CatalogPageSchema.parse(await response.json());
    pages += 1;

    const rows = listing.data.flatMap((item) => {
      const row = parseCatalogSeries(item);
      isEverySeriesRead &&= row !== null;
      return row ? [row] : [];
    });
    seen.push(...rows.map((row) => row.anikotoId));
    stored += await upsert(rows);

    const isLastPage = page >= listing.pagination.total_pages || listing.data.length === 0;
    const isCaughtUp = !full && cutoff !== null && rows.every((row) => row.updatedAt < cutoff);
    if (isLastPage || isCaughtUp) {
      // A series that failed to parse was not seen, but may still be listed.
      if (full && isLastPage && isEverySeriesRead) {
        await db.delete(anikotoSeries).where(notInArray(anikotoSeries.anikotoId, seen));
      }

      return {
        pages,
        stored
      };
    }
  }
}

/**
 * Reads one series of AniKoto's catalogue, as its listing and its series
 * endpoint send it, or `null` when it is malformed.
 */
export function parseCatalogSeries(item: unknown): typeof anikotoSeries.$inferInsert | null {
  const parsed = CatalogSeriesSchema.safeParse(item);
  return parsed.success ? toRow(parsed.data) : null;
}

function toRow(series: z.infer<typeof CatalogSeriesSchema>): typeof anikotoSeries.$inferInsert {
  const type = series.terms_by_type?.type?.[0]?.trim().toLowerCase();

  return {
    anikotoId: series.id,
    anilistId: series.ani_id,
    malId: series.mal_id,
    title: series.title,
    titles: [
      ...new Set(
        [
          series.title,
          series.alternative,
          series.native,
          series.titles,
          // Titles are joined with commas; the whole string is kept too, for
          // titles that contain one.
          ...(series.titles?.split(/[,;] /) ?? [])
        ].flatMap((title) => (title?.trim() ? [title.trim()] : []))
      )
    ],
    format: type ? (formats[type] ?? null) : null,
    year: series.year,
    episodes: series.episodes,
    updatedAt: new Date(`${series.updated_at.replace(" ", "T")}Z`)
  };
}

async function upsert(rows: (typeof anikotoSeries.$inferInsert)[]) {
  if (rows.length === 0) {
    return 0;
  }

  await db
    .insert(anikotoSeries)
    .values(rows)
    .onConflictDoUpdate({
      target: anikotoSeries.anikotoId,
      set: {
        anilistId: sql`excluded.anilist_id`,
        malId: sql`excluded.mal_id`,
        title: sql`excluded.title`,
        titles: sql`excluded.titles`,
        format: sql`excluded.format`,
        year: sql`excluded.year`,
        episodes: sql`excluded.episodes`,
        updatedAt: sql`excluded.updated_at`
      }
    });
  return rows.length;
}

/**
 * How an anime was matched to its AniKoto series: by its own ID or title, or
 * as a `continuation` of its prequel's series, which AniKoto numbers on
 * through both.
 */
export type AniKotoMatchMethod = "id" | "title" | "continuation";

/**
 * Finds the AniKoto series of an anime in the mirrored catalogue.
 *
 * AniKoto series that record the anime's AniList or MyAnimeList ID are the
 * candidates. Those IDs are occasionally wrong or shared, as when a
 * compilation film carries its show's IDs, so each candidate is scored on
 * how well its format, episode count, year, and titles agree, and the best
 * one wins. A candidate of another kind, such as a film for a TV show, is
 * rejected outright.
 *
 * Without an ID match, only a series whose title is exactly one of the
 * anime's, with the same format and year, is accepted, and only when it is
 * the one such series. Closer-sounding titles are never guessed at: a sequel
 * AniKoto does not carry yet would be matched to an earlier season.
 *
 * When the mirror has no match, as for a series AniKoto added since the last
 * sync, AniKoto's search is asked for the anime's titles and the series it
 * finds are added to the mirror and matched the same way.
 *
 * @returns The AniKoto series ID and how it was matched, or `null` when
 *   AniKoto has no series for the anime.
 * @throws when the mirror has no match and AniKoto's search fails.
 */
export async function findAniKotoSeries(http: HttpClient, anime: Anime): Promise<AniKotoMatch | null> {
  const stored = await matchStoredSeries(anime);
  if (stored) {
    return stored;
  }

  await lookUpSeries(http, anime);
  return (await matchStoredSeries(anime)) ?? continuedSeries(anime, continuationDepth);
}

/** An anime's AniKoto series. */
export interface AniKotoMatch {
  anikotoId: string;
  title: string;
  method: AniKotoMatchMethod;
  /**
   * AniKoto episodes that belong to earlier parts: the anime's first episode
   * is AniKoto's episode `episodeOffset + 1`. `0` unless `method` is
   * `continuation`.
   */
  episodeOffset: number;
}

/**
 * The AniKoto series a later part continues, when AniKoto files it under its
 * prequel instead of listing it on its own: Attack on Titan Season 3 Part 2
 * is episodes 13–22 of AniKoto's Season 3. The part must have aired and
 * follow a prequel of known length, and AniKoto's series must hold every
 * episode of both.
 */
async function continuedSeries(anime: Anime, depth: number): Promise<AniKotoMatch | null> {
  const prequel = anime.relations.find((relation) => relation.type === "PREQUEL")?.anime;
  if (
    depth === 0 ||
    anime.status === "NOT_YET_RELEASED" ||
    !prequel?.episodes ||
    formatAgreement(anime.format, prequel.format) === null
  ) {
    return null;
  }

  const prequelAnime = await getAnime(prequel.id);
  const series = (await matchStoredSeries(prequelAnime)) ?? (await continuedSeries(prequelAnime, depth - 1));
  if (!series) {
    return null;
  }

  const [stored] = await db
    .select({
      episodes: anikotoSeries.episodes
    })
    .from(anikotoSeries)
    .where(eq(anikotoSeries.anikotoId, Number(series.anikotoId)));
  const episodeOffset = series.episodeOffset + prequel.episodes;
  // The whole part must be there: a sequel AniKoto has not added yet must
  // not start at a recap AniKoto appended to the prequel.
  return stored?.episodes && stored.episodes >= episodeOffset + (anime.episodes ?? 1)
    ? {
        ...series,
        method: "continuation",
        episodeOffset
      }
    : null;
}

/** Matches an anime against the mirrored catalogue only; see {@link findAniKotoSeries}. */
async function matchStoredSeries(anime: Anime): Promise<AniKotoMatch | null> {
  const candidates = await db
    .select()
    .from(anikotoSeries)
    .where(
      anime.malId
        ? or(eq(anikotoSeries.anilistId, anime.id), eq(anikotoSeries.malId, anime.malId))
        : eq(anikotoSeries.anilistId, anime.id)
    );

  const best = bestIdMatch(anime, candidates);
  if (best) {
    return {
      anikotoId: String(best.anikotoId),
      title: best.title,
      method: "id",
      episodeOffset: 0
    };
  }

  const byTitle = await exactTitleMatches(anime);
  return byTitle.length === 1 && byTitle[0]
    ? {
        anikotoId: String(byTitle[0].anikotoId),
        title: byTitle[0].title,
        method: "title",
        episodeOffset: 0
      }
    : null;
}

/**
 * Searches AniKoto for an anime's English and romaji titles and adds the
 * series it finds, most viewed first, to the mirror.
 */
async function lookUpSeries(http: HttpClient, anime: Anime) {
  const queries = [...new Set([anime.title.english, anime.title.romaji].flatMap((title) => (title ? [title] : [])))];
  const found = new Set<number>();
  for (const query of queries) {
    const response = await http.get(`${siteUrl}/filter?keyword=${encodeURIComponent(query)}&sort=most-viewed`);
    // AniKoto's default order ranks spin-offs above the main series.
    for (const [, id] of (await response.text()).matchAll(/data-tip="(\d+)"/g)) {
      found.add(Number(id));
    }
  }

  const known = new Set(
    found.size === 0
      ? []
      : (
          await db
            .select({
              anikotoId: anikotoSeries.anikotoId
            })
            .from(anikotoSeries)
            .where(inArray(anikotoSeries.anikotoId, [...found]))
        ).map((row) => row.anikotoId)
  );

  const rows: (typeof anikotoSeries.$inferInsert)[] = [];
  for (const id of [...found].filter((candidate) => !known.has(candidate)).slice(0, lookupCandidateLimit)) {
    const parsed = SeriesResponseSchema.safeParse(await (await http.get(`${apiUrl}/series/${id}`)).json());
    const row = parsed.success ? parseCatalogSeries(parsed.data.data.anime) : null;
    if (row) {
      rows.push(row);
    }
  }

  await upsert(rows);
}

type StoredSeries = typeof anikotoSeries.$inferSelect;

/**
 * The candidate sharing an ID with the anime that agrees with it best, or
 * `null` when every one is another kind of entry.
 */
export function bestIdMatch<TCandidate extends StoredSeries>(anime: Anime, candidates: readonly TCandidate[]): TCandidate | null {
  let best: {
    candidate: TCandidate;
    score: number;
  } | null = null;
  for (const candidate of candidates) {
    const score = idMatchScore(anime, candidate);
    if (score !== null && (best === null || score > best.score)) {
      best = {
        candidate,
        score
      };
    }
  }

  return best?.candidate ?? null;
}

/**
 * How well a candidate that shares an ID with the anime agrees with it, or
 * `null` when it is plainly another kind of entry.
 */
function idMatchScore(anime: Anime, candidate: StoredSeries): number | null {
  const formatScore = formatAgreement(anime.format, candidate.format);
  if (formatScore === null) {
    return null;
  }

  const year = anime.seasonYear ?? (anime.startDate ? Number(anime.startDate.slice(0, 4)) : null);
  const titles = animeTitles(anime);

  return (
    (candidate.anilistId === anime.id ? 4 : 0) +
    (anime.malId !== null && candidate.malId === anime.malId ? 4 : 0) +
    formatScore +
    (anime.episodes !== null && candidate.episodes === anime.episodes ? 2 : 0) +
    (year !== null && candidate.year !== null ? (Math.abs(candidate.year - year) <= 1 ? 1 : -2) : 0) +
    3 * Math.max(0, ...candidate.titles.map((title) => bestSimilarity(title, titles))) -
    // AniKoto lists some series twice, once uncensored; the broadcast cut
    // is the one AniList describes.
    (/\buncensored\b/i.test(candidate.title) ? 2 : 0)
  );
}

/**
 * Scores how well two formats agree: `3` when equal, `1` when one site files
 * the other's kind of entry that way, `0` when either is unknown, and `null`
 * when a film faces anything but a film.
 */
function formatAgreement(format: AnimeFormat | null, candidate: string | null): number | null {
  if (format === null || candidate === null) {
    return 0;
  }
  if (format === candidate) {
    return 3;
  }
  if (format === "MOVIE" || candidate === "MOVIE") {
    return null;
  }

  return (episodicFormats.has(format) && episodicFormats.has(candidate)) ||
    (extraFormats.has(format) && extraFormats.has(candidate))
    ? 1
    : -2;
}

/** Series with exactly one of the anime's titles, the same format, and a year no more than one apart. */
async function exactTitleMatches(anime: Anime): Promise<StoredSeries[]> {
  const year = anime.seasonYear ?? (anime.startDate ? Number(anime.startDate.slice(0, 4)) : null);
  if (anime.format === null || year === null) {
    return [];
  }

  const titles = new Set(animeTitles(anime).map(strictTitle).filter((title) => title.length > 0));
  const nearby = await db
    .select()
    .from(anikotoSeries)
    .where(
      and(
        eq(anikotoSeries.format, anime.format),
        gte(anikotoSeries.year, year - 1),
        lte(anikotoSeries.year, year + 1)
      )
    );

  return nearby.filter((candidate) => candidate.titles.some((title) => titles.has(strictTitle(title))));
}

function animeTitles(anime: Anime) {
  return [anime.title.english, anime.title.romaji, anime.title.native, ...anime.synonyms].flatMap((title) =>
    title ? [title] : []
  );
}

/**
 * A title reduced to lowercase letters and digits, keeping every word:
 * unlike `anime-sdk`'s `normalizeTitle`, "Season 2" stays, so a sequel never
 * equals its first season.
 */
export function strictTitle(title: string) {
  return title
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}
