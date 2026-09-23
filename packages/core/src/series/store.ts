import { and, eq, inArray, notInArray, or, sql } from "drizzle-orm";

import { db } from "../database/client";
import { series, seriesEntry, seriesEpisode, seriesRelated, seriesSeason } from "../database/schema";
import { scheduleSeriesStore } from "../scheduler/queue";
import { assignSeasonIds } from "./identity";
import { newSeasonId, newSeriesId } from "./ids";
import { buildSeries, type Series } from "./series";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * Serializes writes of laid-out series. Stores run from requests and
 * scheduler jobs at once, and two stores of one franchise must not both
 * decide which stored series and seasons their entries belong to.
 */
const storeLockKey = 0x5e71e5;

/** Episode rows per insert, well under PostgreSQL's limit of 65,535 parameters. */
const episodeInsertBatch = 1_000;

/**
 * Returns the Sora ID of the series an AniList entry belongs to.
 *
 * The first request for an entry that no stored series contains lays out
 * its series and stores it, which can take many AniList and TMDB requests.
 * Every later request reads one row.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {@link UpstreamUnavailableError} when AniList or TMDB fail.
 */
export async function resolveSeries(anilistId: number): Promise<string> {
  const [stored] = await db
    .select({
      seriesId: seriesEntry.seriesId
    })
    .from(seriesEntry)
    .where(eq(seriesEntry.anilistId, anilistId))
    .limit(1);

  return stored?.seriesId ?? storeSeries(anilistId);
}

/**
 * Lays out the series an AniList entry belongs to and stores it, replacing
 * the stored layout. Returns the series' Sora ID.
 *
 * Stored IDs are kept. The series keeps its ID when it still contains its
 * anchor entry, or otherwise any of its entries; an entry TMDB grouped
 * elsewhere moves to that series. Seasons keep their IDs as
 * {@link assignSeasonIds} describes. Related titles that are not stored yet
 * are queued for the scheduler to store.
 *
 * @throws {@link AnimeNotFoundError} when the ID is unknown to AniList or
 *   belongs to adult media.
 * @throws {@link UpstreamUnavailableError} when AniList or TMDB fail.
 */
export async function storeSeries(anilistId: number): Promise<string> {
  const built = await buildSeries(anilistId);
  const seriesId = await db.transaction((tx) => writeSeries(tx, built));

  const relatedIds = built.related.flatMap((related) => related.anilistIds.slice(0, 1));
  for (const id of await unstoredEntries(relatedIds)) {
    await scheduleSeriesStore(id);
  }

  return seriesId;
}

async function writeSeries(tx: Transaction, built: Series) {
  await tx.execute(sql`select pg_advisory_xact_lock(${storeLockKey})`);

  const seriesId = await chooseSeriesId(tx, built);
  const owners = await tx
    .selectDistinct({
      seriesId: seriesEntry.seriesId
    })
    .from(seriesEntry)
    .where(or(inArray(seriesEntry.anilistId, built.anilistIds), eq(seriesEntry.seriesId, seriesId)));

  // Entries leave whichever series held them; a series left empty is gone.
  await tx.delete(seriesEntry).where(
    or(inArray(seriesEntry.anilistId, built.anilistIds), eq(seriesEntry.seriesId, seriesId))
  );
  const formerOwners = owners.map((owner) => owner.seriesId).filter((id) => id !== seriesId);
  if (formerOwners.length > 0) {
    await tx.delete(series).where(
      and(
        inArray(series.id, formerOwners),
        sql`not exists (select 1 from ${seriesEntry} where ${seriesEntry.seriesId} = ${series.id})`
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
    startDate: built.startDate,
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

  await writeSeasons(tx, seriesId, built);

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
 * The stored series this layout continues: the one holding its anchor entry,
 * else the one with its key, else the oldest one holding any of its entries.
 * A layout that continues none gets a new ID.
 */
async function chooseSeriesId(tx: Transaction, built: Series) {
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

/** Replaces a series' seasons and episodes, keeping season IDs. */
async function writeSeasons(tx: Transaction, seriesId: string, built: Series) {
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
}

/** The given AniList entries that no stored series contains. */
async function unstoredEntries(ids: readonly number[]) {
  if (ids.length === 0) {
    return [];
  }

  const stored = await db
    .select({
      anilistId: seriesEntry.anilistId
    })
    .from(seriesEntry)
    .where(inArray(seriesEntry.anilistId, [...ids]));
  const storedIds = new Set(stored.map((row) => row.anilistId));
  return ids.filter((id) => !storedIds.has(id));
}
