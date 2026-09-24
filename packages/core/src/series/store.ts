import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";

import { getAnime } from "../catalog/queries/anime";
import { db } from "../database/client";
import { series, seriesEntry, seriesEpisode, seriesRelated, seriesSeason, watchlistEntry } from "../database/schema";
import { scheduleSeriesStore, startTrackingAiring } from "../scheduler/queue";
import { assignSeasonIds } from "./identity";
import { newSeasonId, newSeriesId } from "./ids";
import type { SeriesSeason } from "./seasons";
import { buildSeries, type SeriesLayout } from "./series";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serializes writes of laid-out series. Stores run from requests and
 * scheduler jobs at once, and two stores of one franchise must not both
 * decide which stored series and seasons their entries belong to.
 */
const storeLockKey = 0x5e71e5;

/** Episode rows per insert, well under PostgreSQL's limit of 65,535 parameters. */
const episodeInsertBatch = 1_000;

/** The Sora IDs of the stored series containing the given AniList entries, by AniList ID. */
export async function storedSeriesIds(anilistIds: readonly number[]): Promise<Map<number, string>> {
  if (anilistIds.length === 0) {
    return new Map();
  }

  const rows = await db
    .select()
    .from(seriesEntry)
    .where(inArray(seriesEntry.anilistId, [...new Set(anilistIds)]));

  return new Map(rows.map((row) => [row.anilistId, row.seriesId]));
}

/**
 * Lays out the series an AniList entry belongs to and stores it, replacing
 * the stored layout. Returns the series' Sora ID.
 *
 * Stored IDs are kept. The series keeps its ID when it still contains its
 * anchor entry, or otherwise any of its entries; an entry TMDB grouped
 * elsewhere moves to that series. A stored series left without entries is
 * merged into this one, and its watchlist entries move here. Seasons keep their IDs as
 * {@link assignSeasonIds} describes. Related titles that are not stored yet
 * are queued for the scheduler to store, and entries that may still gain
 * episodes are handed to the airing scheduler, which lays the series out
 * again as they air.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {@link UpstreamUnavailableError} when AniList or TMDB fail.
 */
export async function storeSeries(anilistId: number): Promise<string> {
  const built = await buildSeries(anilistId);
  const seriesId = await db.transaction((tx) => writeSeries(tx, built));

  // Readers take the series' details from its anchor entry, so it must be stored.
  await getAnime(built.anchorAnilistId);
  for (const id of built.airingIds) {
    await startTrackingAiring(id);
  }

  const relatedIds = built.related.flatMap((related) => related.anilistIds.slice(0, 1));
  const storedRelated = await storedSeriesIds(relatedIds);
  for (const id of relatedIds.filter((id) => !storedRelated.has(id))) {
    await scheduleSeriesStore(id);
  }

  return seriesId;
}

async function writeSeries(tx: Transaction, built: SeriesLayout) {
  await tx.execute(sql`select pg_advisory_xact_lock(${storeLockKey})`);

  const seriesId = await chooseSeriesId(tx, built);
  const owners = await tx
    .selectDistinct({
      seriesId: seriesEntry.seriesId
    })
    .from(seriesEntry)
    .where(or(inArray(seriesEntry.anilistId, built.anilistIds), eq(seriesEntry.seriesId, seriesId)));

  // Entries leave whichever series held them; a series left empty is merged
  // into this one. Former owners exist only when this series was stored too.
  await tx.delete(seriesEntry).where(
    or(inArray(seriesEntry.anilistId, built.anilistIds), eq(seriesEntry.seriesId, seriesId))
  );
  const formerOwners = owners.map((owner) => owner.seriesId).filter((id) => id !== seriesId);
  const emptied =
    formerOwners.length > 0
      ? await tx
          .select({
            id: series.id
          })
          .from(series)
          .where(
            and(
              inArray(series.id, formerOwners),
              sql`not exists (select 1 from ${seriesEntry} where ${seriesEntry.seriesId} = ${series.id})`
            )
          )
      : [];
  if (emptied.length > 0) {
    await mergeWatchlists(
      tx,
      emptied.map((row) => row.id),
      seriesId
    );
    await tx.delete(series).where(
      inArray(
        series.id,
        emptied.map((row) => row.id)
      )
    );
  }

  const values = {
    key: built.key,
    kind: built.kind,
    anchorAnilistId: built.anchorAnilistId,
    title: built.title,
    overview: built.overview,
    posterUrl: built.posterUrl,
    backdropUrl: built.backdropUrl,
    logoUrl: built.logoUrl,
    startDate: built.startDate,
    status: built.status,
    laidOutAt: new Date()
  };
  await tx
    .insert(series)
    .values({
      id: seriesId,
      ...values
    })
    .onConflictDoUpdate({
      target: series.id,
      set: values
    });

  await tx.insert(seriesEntry).values(
    built.anilistIds.map((id) => ({
      anilistId: id,
      seriesId
    }))
  );

  const seasons = await writeSeasons(tx, seriesId, built);
  const next = nextEpisodeOf(seasons, built.nextAiring);
  await tx
    .update(series)
    .set({
      nextEpisodeSeasonId: next?.seasonId ?? null,
      nextEpisodeNumber: next?.number ?? null,
      nextEpisodeAiringAt: built.nextAiring && next ? new Date(built.nextAiring.airingAt) : null
    })
    .where(eq(series.id, seriesId));

  await tx.delete(seriesRelated).where(eq(seriesRelated.seriesId, seriesId));
  const related = built.related.flatMap((summary, position) =>
    summary.anilistIds.slice(0, 1).map((anilistId) => ({
      seriesId,
      anilistId,
      position
    }))
  );
  if (related.length > 0) {
    await tx.insert(seriesRelated).values(related);
  }

  return seriesId;
}

/**
 * Moves watchlist entries of merged-away series to the series that absorbed
 * them. A user who already lists the absorbing series keeps that entry; a
 * user who listed several merged-away series keeps the most recently
 * changed one.
 */
async function mergeWatchlists(tx: Transaction, fromSeriesIds: readonly string[], toSeriesId: string) {
  const from = sql.join(
    fromSeriesIds.map((id) => sql`${id}`),
    sql`, `
  );

  await tx.execute(sql`
    delete from watchlist_entry as moving
    where moving.series_id in (${from})
      and exists (
        select 1 from watchlist_entry as other
        where other.user_id = moving.user_id
          and (
            other.series_id = ${toSeriesId}
            or (
              other.series_id in (${from})
              and (other.updated_at, other.series_id) > (moving.updated_at, moving.series_id)
            )
          )
      )
  `);
  await tx
    .update(watchlistEntry)
    .set({
      seriesId: toSeriesId
    })
    .where(inArray(watchlistEntry.seriesId, [...fromSeriesIds]));
}

/**
 * The stored series this layout continues: the one holding its anchor entry,
 * else the one with its key, else the oldest one holding any of its entries.
 * A layout that continues none gets a new ID.
 */
async function chooseSeriesId(tx: Transaction, built: SeriesLayout) {
  const candidates = await tx
    .select({
      id: series.id,
      key: series.key,
      anchorHeld: sql<boolean>`exists (
        select 1 from ${seriesEntry}
        where ${seriesEntry.seriesId} = ${series.id} and ${seriesEntry.anilistId} = ${built.anchorAnilistId}
      )`,
      createdAt: series.createdAt
    })
    .from(series)
    .where(
      or(
        eq(series.key, built.key),
        inArray(
          series.id,
          tx
            .select({
              id: seriesEntry.seriesId
            })
            .from(seriesEntry)
            .where(inArray(seriesEntry.anilistId, built.anilistIds))
        )
      )
    )
    .orderBy(series.createdAt);

  const chosen =
    candidates.find((candidate) => candidate.anchorHeld) ??
    candidates.find((candidate) => candidate.key === built.key) ??
    candidates[0];

  return chosen?.id ?? newSeriesId();
}

/** Replaces a series' seasons and episodes, keeping season IDs. Returns the seasons with their IDs. */
async function writeSeasons(tx: Transaction, seriesId: string, built: SeriesLayout) {
  const stored = await tx
    .select({
      id: seriesSeason.id,
      kind: seriesSeason.kind,
      number: seriesSeason.number,
      anchorAnilistId: seriesSeason.anchorAnilistId
    })
    .from(seriesSeason)
    .where(eq(seriesSeason.seriesId, seriesId));

  const seasons = assignSeasonIds(stored, built.seasons, newSeasonId);
  const keptIds = seasons.map(({ id }) => id);

  // Episodes are rewritten wholesale; they are identified by season and number.
  await tx.delete(seriesSeason).where(
    keptIds.length > 0
      ? and(eq(seriesSeason.seriesId, seriesId), notInArray(seriesSeason.id, keptIds))
      : eq(seriesSeason.seriesId, seriesId)
  );
  if (keptIds.length > 0) {
    await tx.delete(seriesEpisode).where(inArray(seriesEpisode.seasonId, keptIds));
  }

  for (const [position, { season, id }] of seasons.entries()) {
    const values = {
      kind: season.kind,
      number: season.number,
      position,
      title: season.title,
      anchorAnilistId: season.anime[0]?.id ?? null
    };
    await tx
      .insert(seriesSeason)
      .values({
        id,
        seriesId,
        ...values
      })
      .onConflictDoUpdate({
        target: seriesSeason.id,
        set: values
      });
  }

  const episodes = seasons.flatMap(({ season, id }) =>
    season.episodes.map((episode) => ({
      seasonId: id,
      number: episode.number,
      anilistId: episode.playback?.anilistId ?? null,
      anilistEpisode: episode.playback?.episode ?? null,
      title: episode.title,
      overview: episode.overview,
      airDate: episode.airDate,
      runtimeMinutes: episode.runtimeMinutes === null ? null : Math.round(episode.runtimeMinutes),
      stillUrl: episode.stillUrl,
      tmdbSeasonNumber: episode.tmdb?.seasonNumber ?? null,
      tmdbEpisodeNumber: episode.tmdb?.episodeNumber ?? null
    }))
  );
  for (let offset = 0; offset < episodes.length; offset += episodeInsertBatch) {
    await tx.insert(seriesEpisode).values(episodes.slice(offset, offset + episodeInsertBatch));
  }

  return seasons;
}

/**
 * The season episode that plays AniList's next episode. While AniList does
 * not know an entry's episode count, its season lists only the aired
 * episodes, so the next one follows the latest listed one.
 */
function nextEpisodeOf(
  seasons: readonly {
    season: SeriesSeason;
    id: string;
  }[],
  nextAiring: SeriesLayout["nextAiring"]
) {
  if (!nextAiring) {
    return null;
  }

  const plays = (episode: SeriesSeason["episodes"][number], number: number) =>
    episode.playback?.anilistId === nextAiring.anilistId && episode.playback.episode === number;

  for (const { season, id } of seasons) {
    const listed = season.episodes.find((episode) => plays(episode, nextAiring.episode));
    if (listed) {
      return {
        seasonId: id,
        number: listed.number
      };
    }

    const latest = season.episodes.find((episode) => plays(episode, nextAiring.episode - 1));
    if (latest) {
      return {
        seasonId: id,
        number: latest.number + 1
      };
    }
  }

  return null;
}
