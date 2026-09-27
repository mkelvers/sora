import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { tmdbHint } from "../database/schema";
import { UpstreamUnavailableError } from "../errors";

/**
 * Fribb/anime-lists' merged list, minified. Its generator rebuilds it about
 * weekly from anime-offline-database, which links AniList to AniDB, and the
 * Anime-Lists project, which links AniDB to TMDB.
 */
const listUrl = "https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json";

const downloadTimeoutMs = 60_000;

/**
 * A list with fewer hints than this share of those stored is taken for a
 * broken upstream rather than titles removed, and is not applied. The list
 * only grows in practice, so a real shrink this large never happens.
 */
const minimumKeptShare = 0.8;

/** Rows written per statement. */
const writeBatchSize = 1_000;

/** The TMDB titles hinted for one AniList entry. */
export interface TmdbHint {
  showId: number | null;
  movieIds: number[];
}

const TmdbIdSchema = z.number().int().positive();

/**
 * One entry of the list. Everything but the AniList and TMDB IDs is ignored,
 * so fields the generator adds or drops later do not matter.
 */
const ListEntrySchema = z.object({
  anilist_id: TmdbIdSchema,
  themoviedb_id: z.object({
    tv: TmdbIdSchema.optional(),
    movie: z.array(TmdbIdSchema).optional()
  })
});

/** The TMDB titles hinted for an AniList entry, or `null` when there are none. */
export async function tmdbHintFor(anilistId: number): Promise<TmdbHint | null> {
  const [row] = await db
    .select({
      showId: tmdbHint.showId,
      movieIds: tmdbHint.movieIds
    })
    .from(tmdbHint)
    .where(eq(tmdbHint.anilistId, anilistId))
    .limit(1);

  return row ?? null;
}

/**
 * Reads the list's hints by AniList ID.
 *
 * Entries without an AniList ID or TMDB IDs, and malformed entries, are
 * skipped. Should two entries name the same AniList ID, the first show wins
 * and the films of both are kept.
 *
 * @throws {@link TypeError} when `list` is not an array.
 */
export function parseTmdbHints(list: unknown): Map<number, TmdbHint> {
  if (!Array.isArray(list)) {
    throw new TypeError("The Fribb/anime-lists list is not an array");
  }

  const hints = new Map<number, TmdbHint>();
  for (const item of list) {
    const parsed = ListEntrySchema.safeParse(item);
    if (!parsed.success) {
      continue;
    }

    const { anilist_id: anilistId, themoviedb_id: ids } = parsed.data;
    const known = hints.get(anilistId);
    const hint = {
      showId: known?.showId ?? ids.tv ?? null,
      movieIds: [...new Set([...(known?.movieIds ?? []), ...(ids.movie ?? [])])]
    };
    if (hint.showId !== null || hint.movieIds.length > 0) {
      hints.set(anilistId, hint);
    }
  }

  return hints;
}

/**
 * Brings the stored hints in line with the current list: new and changed
 * hints are written, and hints the list no longer has are removed.
 *
 * @returns The AniList IDs whose hint changed, removed ones included.
 * @throws {@link UpstreamUnavailableError} when the list cannot be downloaded
 *   or read, or holds far fewer hints than are stored; the stored hints are
 *   then kept as they are.
 */
export async function syncTmdbHints(): Promise<number[]> {
  const fetched = await downloadHints();
  const stored = new Map(
    (await db.select().from(tmdbHint)).map(({ anilistId, ...hint }) => [anilistId, hint])
  );
  if (fetched.size < stored.size * minimumKeptShare) {
    throw new UpstreamUnavailableError(
      `Fribb/anime-lists lists ${fetched.size} TMDB hints against ${stored.size} stored; keeping the stored ones`,
      {
        retryAfterMs: null
      }
    );
  }

  const changed = [...fetched].filter(([anilistId, hint]) => !sameHint(stored.get(anilistId), hint));
  const removed = [...stored.keys()].filter((anilistId) => !fetched.has(anilistId));

  await db.transaction(async (tx) => {
    for (let start = 0; start < changed.length; start += writeBatchSize) {
      await tx
        .insert(tmdbHint)
        .values(
          changed.slice(start, start + writeBatchSize).map(([anilistId, hint]) => ({
            anilistId,
            ...hint
          }))
        )
        .onConflictDoUpdate({
          target: tmdbHint.anilistId,
          set: {
            showId: sql`excluded.show_id`,
            movieIds: sql`excluded.movie_ids`
          }
        });
    }

    for (let start = 0; start < removed.length; start += writeBatchSize) {
      await tx.delete(tmdbHint).where(inArray(tmdbHint.anilistId, removed.slice(start, start + writeBatchSize)));
    }
  });

  return [
    ...changed.map(([anilistId]) => anilistId),
    ...removed
  ];
}

async function downloadHints() {
  let list: unknown;
  try {
    const response = await fetch(listUrl, {
      signal: AbortSignal.timeout(downloadTimeoutMs)
    });
    if (!response.ok) {
      throw new Error(`GitHub answered ${response.status}`);
    }

    list = await response.json();
  } catch (error) {
    throw new UpstreamUnavailableError("Downloading the Fribb/anime-lists list failed", {
      retryAfterMs: null,
      cause: error
    });
  }

  try {
    return parseTmdbHints(list);
  } catch (error) {
    throw new UpstreamUnavailableError("The Fribb/anime-lists list is malformed", {
      retryAfterMs: null,
      cause: error
    });
  }
}

function sameHint(left: TmdbHint | undefined, right: TmdbHint) {
  return (
    left !== undefined &&
    left.showId === right.showId &&
    left.movieIds.length === right.movieIds.length &&
    left.movieIds.every((id, index) => id === right.movieIds[index])
  );
}
