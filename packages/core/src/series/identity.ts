import type { SeasonKind } from "./seasons";

/** What identifies a stored season when a series is laid out again. */
export interface StoredSeason {
  id: string;
  kind: SeasonKind;
  number: number;
  /** The season's first AniList entry, or `null` for a season made only of TMDB extras. */
  anchorAnilistId: number | null;
}

/**
 * Gives each newly laid out season an ID, reusing the stored seasons' IDs so
 * that a season keeps its ID for good.
 *
 * A season is identified by its anchor, its first AniList entry:
 *
 * 1. A stored season anchored to the season's own first entry keeps its ID.
 * 2. Otherwise a stored season anchored to any of the season's entries
 *    passes its ID on, such as when an earlier part was merged in front.
 * 3. A season without AniList entries takes the ID of the stored anchorless
 *    season of the same kind and number.
 *
 * Every other season is new. Each stored ID is used at most once, so a
 * stored season that no longer matches anything is dropped.
 *
 * @param newId - Creates the ID for a season that matches no stored season.
 * @returns Each season with its ID, in the order of `seasons`.
 */
export function assignSeasonIds<
  TSeason extends {
    kind: SeasonKind;
    number: number;
    /** The season's AniList entries, in order. */
    anime: readonly {
      id: number;
    }[];
  }
>(
  stored: readonly StoredSeason[],
  seasons: readonly TSeason[],
  newId: () => string
): {
  season: TSeason;
  id: string;
}[] {
  const available = new Set(stored);
  const take = (season: StoredSeason | undefined) => {
    if (season) {
      available.delete(season);
    }

    return season?.id;
  };

  const ids: (string | undefined)[] = seasons.map((season) =>
    take([...available].find((candidate) => candidate.anchorAnilistId !== null && candidate.anchorAnilistId === season.anime[0]?.id))
  );

  seasons.forEach((season, index) => {
    if (ids[index] !== undefined) {
      return;
    }

    const entryIds = new Set(season.anime.map((anime) => anime.id));
    ids[index] =
      season.anime.length > 0
        ? take([...available].find((candidate) => candidate.anchorAnilistId !== null && entryIds.has(candidate.anchorAnilistId)))
        : take(
            [...available].find(
              (candidate) => candidate.anchorAnilistId === null && candidate.kind === season.kind && candidate.number === season.number
            )
          );
  });

  return seasons.map((season, index) => ({
    season,
    id: ids[index] ?? newId()
  }));
}
