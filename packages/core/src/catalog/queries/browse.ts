import { z } from "zod";

import { anilist } from "../../anilist/client";
import { BrowseAnimeDocument, GenresDocument, type MediaSort } from "../../anilist/graphql.generated";
import { InvalidInputError } from "../../errors";
import { day, hour, minute } from "../../time";
import { toAnimeCard, type AnimeCard } from "../models/anime";

/** One page of results. */
export interface Page<T> {
  items: T[];
  page: number;
  hasNextPage: boolean;
}

/** Browse filters accepted from clients. Validate untrusted input with this schema. */
export const BrowseQuerySchema = z.object({
  /** Free-text search. When present, results are ordered by relevance unless `sort` is set. */
  search: z.string().trim().min(1).max(200).optional(),
  sort: z.enum(["trending", "popular", "score", "newest", "title"]).optional(),
  season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]).optional(),
  seasonYear: z.number().int().min(1940).max(2100).optional(),
  format: z.array(z.enum(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"])).optional(),
  status: z.enum(["RELEASING", "FINISHED", "NOT_YET_RELEASED", "CANCELLED", "HIATUS"]).optional(),
  genres: z.array(z.string().min(1)).max(10).optional(),
  page: z.number().int().positive().max(500).default(1),
  perPage: z.number().int().positive().max(50).default(24)
});

export type BrowseQuery = z.input<typeof BrowseQuerySchema>;

const sortOrders: Record<NonNullable<z.infer<typeof BrowseQuerySchema>["sort"]>, MediaSort[]> = {
  trending: [
    "TRENDING_DESC",
    "POPULARITY_DESC"
  ],
  popular: ["POPULARITY_DESC"],
  score: [
    "SCORE_DESC",
    "POPULARITY_DESC"
  ],
  newest: [
    "START_DATE_DESC",
    "POPULARITY_DESC"
  ],
  title: ["TITLE_ROMAJI"]
};

/**
 * Searches and filters the catalog. Adult media is always excluded.
 *
 * @example
 * ```ts
 * const page = await browseAnime({ season: "FALL", seasonYear: 2026, sort: "popular" });
 * ```
 *
 * @throws {@link InvalidInputError} when the query fails {@link BrowseQuerySchema}.
 */
export async function browseAnime(query: BrowseQuery): Promise<Page<AnimeCard>> {
  const parsed = BrowseQuerySchema.safeParse(query);
  if (!parsed.success) {
    throw new InvalidInputError("Invalid browse query", {
      cause: parsed.error
    });
  }

  const input = parsed.data;
  const sort: MediaSort[] = input.sort
    ? sortOrders[input.sort]
    : input.search
      ? ["SEARCH_MATCH"]
      : sortOrders.trending;

  const { Page } = await anilist(
    BrowseAnimeDocument,
    {
      page: input.page,
      perPage: input.perPage,
      // Absent filters must be omitted, not null; see codegen.ts.
      search: input.search,
      sort,
      season: input.season,
      seasonYear: input.seasonYear,
      format: input.format,
      status: input.status,
      genres: input.genres
    },
    {
      // Searches are rarely repeated exactly; lists like "trending" are shared.
      maxAgeMs: input.search ? 10 * minute : hour
    }
  );

  return {
    items: (Page?.media ?? []).flatMap((media) => (media ? [toAnimeCard(media)] : [])),
    page: input.page,
    hasNextPage: Page?.pageInfo?.hasNextPage === true
  };
}

/** Lists the genre names accepted by {@link browseAnime}. */
export async function getGenres(): Promise<string[]> {
  const { GenreCollection } = await anilist(
    GenresDocument,
    {},
    {
      maxAgeMs: 7 * day
    }
  );

  // "Hentai" is only reachable through adult media, which is never served.
  return (GenreCollection ?? []).filter(
    (genre): genre is string => genre !== null && genre !== "Hentai"
  );
}
