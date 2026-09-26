import { and, count, desc, eq, gte, inArray, max, ne, sql, type SQL } from "drizzle-orm";

import { db } from "../../database/client";
import { anime, animeSearch, playbackProgress, series, seriesEntry, seriesRelated, watchlistEntry } from "../../database/schema";
import { scheduleSeriesStore } from "../../scheduler/queue";
import type { SeriesCard } from "../../series/models";
import { toSeriesCard } from "../../series/queries";
import { favoriteGenres, rankCandidates, tasteOf, titleWeight, type TasteSeed, type TitleActivity } from "./taste";

/** Genres a taste is matched on beyond users' votes. */
const matchedGenres = 3;

/** Titles found by genre alone, the most popular first. */
const genreCandidateLimit = 300;

/** How popular a title found by genre alone must be, in AniList users, to be worth suggesting. */
const genreCandidatePopularity = 10_000;

/** Formats worth recommending: shows and films, not music videos, specials, or OVAs. */
const recommendedFormats = [
  "TV",
  "ONA",
  "MOVIE"
] as const;

/**
 * Suggests titles a profile has not seen, best fit first, from what it has
 * played and put on its watchlist.
 *
 * Taste comes from AniList users' recommendations for those titles and from
 * the genres they share; see {@link rankCandidates}. Titles already played or
 * listed are left out, as are their spin-offs and films, which their own
 * pages list, and so are titles not stored yet: those are queued
 * for the scheduler, so a later call finds them. A profile with no history
 * gets none.
 */
export async function getRecommendations(userId: string, limit = 20): Promise<SeriesCard[]> {
  const activity = await titleActivity(userId);
  if (activity.size === 0) {
    return [];
  }

  const now = new Date();
  const weights = new Map([...activity].map(([seriesId, title]) => [seriesId, titleWeight(title, now)]));
  const taste = tasteOf(await seedsOf(weights));
  const genres = favoriteGenres(taste, matchedGenres);
  if (genres.length === 0 && taste.votes.size === 0) {
    return [];
  }

  const [candidates, related] = await Promise.all([
    candidatesFor([...taste.votes.keys()], genres),
    relatedOf([...activity.keys()])
  ]);
  const ranked = rankCandidates(
    taste,
    candidates.filter((candidate) => !related.has(candidate.anilistId))
  );
  const seriesIds = await seriesOf(ranked.map((candidate) => candidate.anilistId));

  const picked: string[] = [];
  const missing: number[] = [];
  for (const { anilistId } of ranked) {
    if (picked.length >= limit) {
      break;
    }

    const seriesId = seriesIds.get(anilistId);
    if (seriesId === undefined) {
      missing.push(anilistId);
    } else if (!activity.has(seriesId) && !picked.includes(seriesId)) {
      picked.push(seriesId);
    }
  }

  for (const anilistId of missing.slice(0, limit)) {
    await scheduleSeriesStore(anilistId, "backfill");
  }

  if (picked.length === 0) {
    return [];
  }

  const rows = await db.select().from(series).where(inArray(series.id, picked));
  const cards = new Map(rows.map((row) => [row.id, toSeriesCard(row)]));
  return picked.flatMap((id) => cards.get(id) ?? []);
}

/** What a profile did with each title it has played or listed, keyed by series ID. */
async function titleActivity(userId: string): Promise<Map<string, TitleActivity>> {
  const [played, listed] = await Promise.all([
    db
      .select({
        seriesId: seriesEntry.seriesId,
        episodes: count(),
        lastPlayedAt: max(playbackProgress.eventAt)
      })
      .from(playbackProgress)
      .innerJoin(seriesEntry, eq(seriesEntry.anilistId, playbackProgress.anilistId))
      .where(eq(playbackProgress.userId, userId))
      .groupBy(seriesEntry.seriesId),
    db
      .select({
        seriesId: watchlistEntry.seriesId,
        status: watchlistEntry.status,
        updatedAt: watchlistEntry.updatedAt
      })
      .from(watchlistEntry)
      .where(eq(watchlistEntry.userId, userId))
  ]);

  const activity = new Map<string, TitleActivity>();
  for (const row of played) {
    activity.set(row.seriesId, {
      status: null,
      episodesPlayed: row.episodes,
      lastActiveAt: row.lastPlayedAt ?? new Date(0)
    });
  }
  for (const row of listed) {
    const title = activity.get(row.seriesId);
    activity.set(row.seriesId, {
      status: row.status,
      episodesPlayed: title?.episodesPlayed ?? 0,
      lastActiveAt: title && title.lastActiveAt > row.updatedAt ? title.lastActiveAt : row.updatedAt
    });
  }

  return activity;
}

/**
 * Seeds taste with each title's genres and recommendations, gathered over
 * every stored AniList entry of the title, so each season's recommendations
 * count.
 */
async function seedsOf(weights: ReadonlyMap<string, number>): Promise<TasteSeed[]> {
  const rows = await db
    .select({
      seriesId: seriesEntry.seriesId,
      media: anime.media
    })
    .from(seriesEntry)
    .innerJoin(anime, eq(anime.anilistId, seriesEntry.anilistId))
    .where(inArray(seriesEntry.seriesId, [...weights.keys()]));

  const seeds = new Map<
    string,
    {
      weight: number;
      genres: Set<string>;
      recommended: number[];
    }
  >();
  for (const { seriesId, media } of rows) {
    const seed = seeds.get(seriesId) ?? {
      weight: weights.get(seriesId) ?? 0,
      genres: new Set<string>(),
      recommended: [] as number[]
    };
    for (const genre of media.genres ?? []) {
      if (genre) {
        seed.genres.add(genre);
      }
    }
    for (const node of media.recommendations?.nodes ?? []) {
      const recommendation = node?.mediaRecommendation;
      if (recommendation?.type === "ANIME" && !recommendation.isAdult) {
        seed.recommended.push(recommendation.id);
      }
    }
    seeds.set(seriesId, seed);
  }

  return [...seeds.values()].map((seed): TasteSeed => ({
    weight: seed.weight,
    genres: [...seed.genres],
    recommended: seed.recommended
  }));
}

/**
 * Titles worth ranking from the search index: those users recommend, and
 * popular ones in the favorite genres. Both only as shows or films that have
 * started airing.
 */
async function candidatesFor(recommended: readonly number[], genres: readonly string[]) {
  const suitable: SQL[] = [
    eq(animeSearch.isAdult, false),
    inArray(animeSearch.format, [...recommendedFormats]),
    ne(animeSearch.status, "NOT_YET_RELEASED")
  ];

  const [voted, alike] = await Promise.all([
    recommended.length > 0
      ? db
          .select()
          .from(animeSearch)
          .where(and(...suitable, inArray(animeSearch.anilistId, [...recommended])))
      : [],
    genres.length > 0
      ? db
          .select()
          .from(animeSearch)
          .where(
            and(
              ...suitable,
              gte(animeSearch.popularity, genreCandidatePopularity),
              sql`${animeSearch.genres} ?| ${sql.raw(`array[${genres.map(quoteLiteral).join(",")}]`)}`
            )
          )
          .orderBy(desc(animeSearch.popularity))
          .limit(genreCandidateLimit)
      : []
  ]);

  const byId = new Map([...voted, ...alike].map((row) => [row.anilistId, row]));
  return [...byId.values()];
}

/** The AniList entries related to the given series, such as their films and spin-offs. */
async function relatedOf(seriesIds: readonly string[]): Promise<Set<number>> {
  const rows = await db
    .select({
      anilistId: seriesRelated.anilistId
    })
    .from(seriesRelated)
    .where(inArray(seriesRelated.seriesId, [...seriesIds]));
  return new Set(rows.map((row) => row.anilistId));
}

/** The stored series of each AniList entry that has one. */
async function seriesOf(anilistIds: readonly number[]): Promise<Map<number, string>> {
  if (anilistIds.length === 0) {
    return new Map();
  }

  const rows = await db.select().from(seriesEntry).where(inArray(seriesEntry.anilistId, [...anilistIds]));
  return new Map(rows.map((row) => [row.anilistId, row.seriesId]));
}

/** A genre name as an SQL string literal; genre names come from AniList, not from clients, but are quoted all the same. */
function quoteLiteral(text: string) {
  return `'${text.replaceAll("'", "''")}'`;
}
