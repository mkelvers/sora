import type {
  AnimeCardFragment,
  AnimeDetailsFragment,
  MediaFormat,
  MediaRelation,
  MediaSeason,
  MediaSource,
  MediaStatus
} from "../../anilist/graphql.generated";
import { fromUnixSeconds, fuzzyDate, plainText } from "./text";

export type AnimeFormat = Exclude<MediaFormat, "MANGA" | "NOVEL" | "ONE_SHOT">;
export type AnimeStatus = MediaStatus;
export type AnimeSeason = MediaSeason;
export type AnimeSource = MediaSource;
export type AnimeRelationType = MediaRelation;

/**
 * Every title AniList knows, plus the one to show.
 *
 * `display` prefers English, then romaji, then native, which matches what
 * most Western clients expect. Clients that want a different preference can
 * pick from the individual fields.
 */
export interface AnimeTitle {
  display: string;
  english: string | null;
  romaji: string | null;
  native: string | null;
}

/** An upcoming episode announced by AniList. */
export interface AiringEpisode {
  number: number;
  /** ISO 8601 timestamp. */
  airingAt: string;
}

/**
 * The compact form of an anime, for lists, grids, and carousels.
 *
 * @remarks
 * All catalog models are plain JSON-safe values, so any transport can return
 * them unchanged.
 */
export interface AnimeCard {
  /** AniList ID. This is the canonical anime ID across the whole system. */
  id: number;
  malId: number | null;
  title: AnimeTitle;
  coverUrl: string | null;
  /** Dominant cover colour as `#rrggbb`, useful for placeholder backgrounds. */
  coverColor: string | null;
  bannerUrl: string | null;
  format: AnimeFormat | null;
  status: AnimeStatus | null;
  season: AnimeSeason | null;
  seasonYear: number | null;
  /** Planned episode count; `null` while unknown. */
  episodes: number | null;
  durationMinutes: number | null;
  /** Weighted average score, 0–100. */
  score: number | null;
  popularity: number | null;
  genres: string[];
  nextEpisode: AiringEpisode | null;
  isAdult: boolean;
}

/** A related entry in the same franchise. */
export interface AnimeRelation {
  type: AnimeRelationType;
  anime: AnimeCard;
}

export interface AnimeTag {
  name: string;
  /** How strongly the tag applies, 0–100. */
  rank: number | null;
  spoiler: boolean;
}

/** Everything needed to render an anime's detail screen. */
export interface Anime extends AnimeCard {
  synonyms: string[];
  /** Plain-text synopsis with AniList markup and source notes removed. */
  description: string | null;
  source: AnimeSource | null;
  countryOfOrigin: string | null;
  /** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, depending on what is known. */
  startDate: string | null;
  endDate: string | null;
  tags: AnimeTag[];
  studios: string[];
  relations: AnimeRelation[];
  recommendations: AnimeCard[];
}

/**
 * Converts an AniList card fragment into the domain model.
 *
 * @throws {TypeError} when AniList returns media with no title at all, which
 *   would violate AniList's own data rules.
 */
export function toAnimeCard(media: AnimeCardFragment): AnimeCard {
  return {
    id: media.id,
    malId: media.idMal,
    title: toTitle(media),
    coverUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
    coverColor: media.coverImage?.color ?? null,
    bannerUrl: media.bannerImage,
    format: toAnimeFormat(media.format),
    status: media.status,
    season: media.season,
    seasonYear: media.seasonYear,
    episodes: media.episodes,
    durationMinutes: media.duration,
    score: media.averageScore,
    popularity: media.popularity,
    genres: present(media.genres),
    nextEpisode: media.nextAiringEpisode
      ? {
          number: media.nextAiringEpisode.episode,
          airingAt: fromUnixSeconds(media.nextAiringEpisode.airingAt)
        }
      : null,
    isAdult: media.isAdult === true
  };
}

/** Converts an AniList details fragment into the domain model. */
export function toAnime(media: AnimeDetailsFragment): Anime {
  return {
    ...toAnimeCard(media),
    synonyms: present(media.synonyms),
    description: media.description ? plainText(media.description) : null,
    source: media.source,
    countryOfOrigin: media.countryOfOrigin,
    startDate: media.startDate ? fuzzyDate(media.startDate) : null,
    endDate: media.endDate ? fuzzyDate(media.endDate) : null,
    tags: present(media.tags).map((tag) => ({
      name: tag.name,
      rank: tag.rank,
      spoiler: tag.isMediaSpoiler === true
    })),
    studios: present(media.studios?.nodes).map((studio) => studio.name),
    relations: present(media.relations?.edges).flatMap((edge) =>
      edge.relationType && edge.node?.type === "ANIME"
        ? [
            {
              type: edge.relationType,
              anime: toAnimeCard(edge.node)
            }
          ]
        : []
    ),
    recommendations: present(media.recommendations?.nodes).flatMap((node) =>
      node.mediaRecommendation?.type === "ANIME" ? [toAnimeCard(node.mediaRecommendation)] : []
    )
  };
}

function toTitle(media: AnimeCardFragment): AnimeTitle {
  const english = media.title?.english ?? null;
  const romaji = media.title?.romaji ?? null;
  const native = media.title?.native ?? null;
  const display = english ?? romaji ?? native;
  if (!display) {
    throw new TypeError(`AniList media ${media.id} has no title`);
  }

  return {
    display,
    english,
    romaji,
    native
  };
}

function toAnimeFormat(format: MediaFormat | null): AnimeFormat | null {
  switch (format) {
    case "MANGA":
    case "NOVEL":
    case "ONE_SHOT":
      throw new TypeError(`Unexpected non-anime format ${format}`);
    default:
      return format;
  }
}

/** Drops GraphQL list holes; a null list is treated as empty. */
function present<T>(values: readonly (T | null)[] | null | undefined): T[] {
  return values ? values.filter((value): value is T => value !== null) : [];
}
