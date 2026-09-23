import { z } from "zod";

import { day, hour } from "../time";
import { tmdb } from "./client";

/** TMDB sends missing dates and text as `""` or `null`; both become `null`. */
const OptionalText = z
  .string()
  .nullish()
  .transform((value) => (value ? value : null));

const ShowSearchSchema = z.object({
  results: z.array(
    z.object({
      id: z.number().int(),
      name: z.string(),
      original_name: z.string(),
      first_air_date: OptionalText,
      popularity: z.number()
    })
  )
});

const MovieSearchSchema = z.object({
  results: z.array(
    z.object({
      id: z.number().int(),
      title: z.string(),
      original_title: z.string(),
      release_date: OptionalText,
      popularity: z.number()
    })
  )
});

const EpisodeSchema = z.object({
  season_number: z.number().int(),
  episode_number: z.number().int(),
  name: OptionalText,
  overview: OptionalText,
  air_date: OptionalText,
  runtime: z.number().nullish().transform((value) => value ?? null),
  still_path: OptionalText
});

const SeasonSchema = z.object({
  episodes: z.array(EpisodeSchema)
});

const ShowFields = {
  id: z.number().int(),
  name: z.string(),
  original_name: z.string(),
  overview: OptionalText,
  poster_path: OptionalText,
  backdrop_path: OptionalText,
  first_air_date: OptionalText,
  seasons: z.array(
    z.object({
      season_number: z.number().int(),
      name: OptionalText,
      poster_path: OptionalText
    })
  )
};

const MovieSchema = z.object({
  id: z.number().int(),
  title: z.string(),
  original_title: z.string(),
  overview: OptionalText,
  poster_path: OptionalText,
  backdrop_path: OptionalText,
  release_date: OptionalText,
  runtime: z.number().nullish().transform((value) => value ?? null)
});

const ImagesSchema = z.object({
  logos: z.array(
    z.object({
      file_path: z.string(),
      iso_639_1: z.string().nullish(),
      vote_average: z.number()
    })
  )
});

/** One TV show found by {@link searchShows}. */
export type TmdbShowResult = z.infer<typeof ShowSearchSchema>["results"][number];

/** One movie found by {@link searchMovies}. */
export type TmdbMovieResult = z.infer<typeof MovieSearchSchema>["results"][number];

/** One TMDB episode. Dates are `YYYY-MM-DD`. */
export type TmdbEpisode = z.infer<typeof EpisodeSchema>;

/** A TMDB movie's details. */
export type TmdbMovie = z.infer<typeof MovieSchema>;

/** A TMDB show with every episode of every season, including specials (season 0). */
export interface TmdbShow {
  id: number;
  name: string;
  originalName: string;
  overview: string | null;
  posterPath: string | null;
  backdropPath: string | null;
  firstAirDate: string | null;
  /** Every season TMDB lists, including specials (season 0). */
  seasons: TmdbSeason[];
  /** Every episode, ordered by season and then episode number. */
  episodes: TmdbEpisode[];
}

/** A season's own name and artwork, such as "Mugen Train Arc". */
export interface TmdbSeason {
  seasonNumber: number;
  name: string | null;
  posterPath: string | null;
}

/** TMDB caps `append_to_response` at 20 sub-requests. */
const seasonsPerRequest = 20;

/** Titles and air dates change rarely; searches are cached for a day. */
const searchLifetimeMs = day;

/** Show structure is refreshed often enough to pick up newly listed episodes. */
const showLifetimeMs = 12 * hour;

/** Searches TMDB TV shows by title. Returns the first page, best matches first. */
export async function searchShows(query: string): Promise<TmdbShowResult[]> {
  const result = await tmdb(
    "/search/tv",
    {
      query,
      include_adult: "false",
      language: "en-US"
    },
    ShowSearchSchema,
    {
      maxAgeMs: searchLifetimeMs
    }
  );

  return result?.results ?? [];
}

/** Searches TMDB movies by title. Returns the first page, best matches first. */
export async function searchMovies(query: string): Promise<TmdbMovieResult[]> {
  const result = await tmdb(
    "/search/movie",
    {
      query,
      include_adult: "false",
      language: "en-US"
    },
    MovieSearchSchema,
    {
      maxAgeMs: searchLifetimeMs
    }
  );

  return result?.results ?? [];
}

/**
 * Loads a TMDB show with all of its episodes.
 *
 * Seasons are fetched through `append_to_response`, so a show with fewer
 * than 20 seasons costs one request. TMDB silently omits seasons that do not
 * exist, which lets the first request ask for seasons 0–19 blind.
 *
 * @returns The show, or `null` when TMDB does not know the ID.
 */
export async function getShow(showId: number): Promise<TmdbShow | null> {
  const episodes: TmdbEpisode[] = [];
  let details: z.infer<ReturnType<typeof showPageSchema>> | null = null;

  for (let firstSeason = 0; ; firstSeason += seasonsPerRequest) {
    const seasons = Array.from({ length: seasonsPerRequest }, (_, index) => firstSeason + index);
    const page = await tmdb(
      `/tv/${showId}`,
      {
        append_to_response: seasons.map((season) => `season/${season}`).join(","),
        language: "en-US"
      },
      showPageSchema(seasons),
      {
        maxAgeMs: showLifetimeMs
      }
    );

    if (!page) {
      return null;
    }

    details ??= page;
    for (const season of seasons) {
      episodes.push(...(page[`season/${season}`]?.episodes ?? []));
    }

    const lastSeason = Math.max(...page.seasons.map((season) => season.season_number));
    if (lastSeason < firstSeason + seasonsPerRequest) {
      break;
    }
  }

  episodes.sort((left, right) => left.season_number - right.season_number || left.episode_number - right.episode_number);

  return {
    id: details.id,
    name: details.name,
    originalName: details.original_name,
    overview: details.overview,
    posterPath: details.poster_path,
    backdropPath: details.backdrop_path,
    firstAirDate: details.first_air_date,
    seasons: details.seasons.map((season) => ({
      seasonNumber: season.season_number,
      name: season.name,
      posterPath: season.poster_path
    })),
    episodes
  };
}

/**
 * Loads a TMDB movie's details.
 *
 * @returns The movie, or `null` when TMDB does not know the ID.
 */
export function getMovie(movieId: number): Promise<TmdbMovie | null> {
  return tmdb(
    `/movie/${movieId}`,
    {
      language: "en-US"
    },
    MovieSchema,
    {
      maxAgeMs: day
    }
  );
}

/**
 * Finds the logo (the title artwork drawn over a backdrop) of a show or film.
 *
 * English logos are preferred, then logos without text language, each by
 * TMDB's vote average. Logos in other languages are never used, since a
 * Japanese logo on an English page reads as a mistake.
 *
 * @returns The logo's image path, or `null` when TMDB has none.
 */
export async function getLogoPath(mediaType: "tv" | "movie", id: number): Promise<string | null> {
  const images = await tmdb(
    `/${mediaType}/${id}/images`,
    {
      include_image_language: "en,null"
    },
    ImagesSchema,
    {
      maxAgeMs: day
    }
  );

  const logos = (images?.logos ?? [])
    .filter((logo) => logo.iso_639_1 === "en" || !logo.iso_639_1)
    .sort((left, right) =>
      Number(right.iso_639_1 === "en") - Number(left.iso_639_1 === "en") || right.vote_average - left.vote_average
    );

  return logos[0]?.file_path ?? null;
}

/** A show's details plus the appended `season/N` objects for the requested seasons. */
function showPageSchema(seasons: readonly number[]) {
  return z.object({
    ...ShowFields,
    ...Object.fromEntries(seasons.map((season) => [`season/${season}`, SeasonSchema.nullish()]))
  }) as z.ZodObject<typeof ShowFields & Record<`season/${number}`, z.ZodOptional<z.ZodNullable<typeof SeasonSchema>>>>;
}

/**
 * Builds a TMDB image URL.
 *
 * @param size - A TMDB size bucket such as `w780` or `original`.
 */
export function tmdbImageUrl(path: string | null, size: "w300" | "w500" | "w780" | "w1280" | "original") {
  return path ? `https://image.tmdb.org/t/p/${size}${path}` : null;
}
