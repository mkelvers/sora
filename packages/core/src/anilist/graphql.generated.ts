/** Internal type. DO NOT USE DIRECTLY. */
type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
/** Internal type. DO NOT USE DIRECTLY. */
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
import type { DocumentTypeDecoration } from '@graphql-typed-document-node/core';
/** The format the media was released in */
export type MediaFormat =
  /** Professionally published manga with more than one chapter */
  | 'MANGA'
  /** Anime movies with a theatrical release */
  | 'MOVIE'
  /** Short anime released as a music video */
  | 'MUSIC'
  /** Written books released as a series of light novels */
  | 'NOVEL'
  /** (Original Net Animation) Anime that have been originally released online or are only available through streaming services. */
  | 'ONA'
  /** Manga with just one chapter */
  | 'ONE_SHOT'
  /** (Original Video Animation) Anime that have been released directly on DVD/Blu-ray without originally going through a theatrical release or television broadcast */
  | 'OVA'
  /** Special episodes that have been included in DVD/Blu-ray releases, picture dramas, pilots, etc */
  | 'SPECIAL'
  /** Anime broadcast on television */
  | 'TV'
  /** Anime which are under 15 minutes in length and broadcast on television */
  | 'TV_SHORT';

/** Type of relation media has to its parent. */
export type MediaRelation =
  /** An adaption of this media into a different format */
  | 'ADAPTATION'
  /** An alternative version of the same media */
  | 'ALTERNATIVE'
  /** Shares at least 1 character */
  | 'CHARACTER'
  /** Version 2 only. */
  | 'COMPILATION'
  /** Version 2 only. */
  | 'CONTAINS'
  /** Other */
  | 'OTHER'
  /** The media a side story is from */
  | 'PARENT'
  /** Released before the relation */
  | 'PREQUEL'
  /** Version 3 only. The media is set in the same universe as another media */
  | 'SAME_UNIVERSE'
  /** Released after the relation */
  | 'SEQUEL'
  /** A side story of the parent media */
  | 'SIDE_STORY'
  /** Version 2 only. The source material the media was adapted from */
  | 'SOURCE'
  /** An alternative version of the media with a different primary focus */
  | 'SPIN_OFF'
  /** A shortened and summarized version */
  | 'SUMMARY';

export type MediaSeason =
  /** Predominantly started airing between October and November */
  | 'FALL'
  /** Predominantly started airing between April and June */
  | 'SPRING'
  /** Predominantly started airing between July and September */
  | 'SUMMER'
  /** Predominantly started airing between January and March */
  | 'WINTER';

/** Media sort enums */
export type MediaSort =
  | 'CHAPTERS'
  | 'CHAPTERS_DESC'
  | 'DURATION'
  | 'DURATION_DESC'
  | 'END_DATE'
  | 'END_DATE_DESC'
  | 'EPISODES'
  | 'EPISODES_DESC'
  | 'FAVOURITES'
  | 'FAVOURITES_DESC'
  | 'FORMAT'
  | 'FORMAT_DESC'
  | 'ID'
  | 'ID_DESC'
  | 'POPULARITY'
  | 'POPULARITY_DESC'
  | 'SCORE'
  | 'SCORE_DESC'
  | 'SEARCH_MATCH'
  | 'START_DATE'
  | 'START_DATE_DESC'
  | 'STATUS'
  | 'STATUS_DESC'
  | 'TITLE_ENGLISH'
  | 'TITLE_ENGLISH_DESC'
  | 'TITLE_NATIVE'
  | 'TITLE_NATIVE_DESC'
  | 'TITLE_ROMAJI'
  | 'TITLE_ROMAJI_DESC'
  | 'TRENDING'
  | 'TRENDING_DESC'
  | 'TYPE'
  | 'TYPE_DESC'
  | 'UPDATED_AT'
  | 'UPDATED_AT_DESC'
  | 'VOLUMES'
  | 'VOLUMES_DESC';

/** Source type the media was adapted from */
export type MediaSource =
  /** Version 2+ only. Japanese Anime */
  | 'ANIME'
  /** Version 3 only. Comics excluding manga */
  | 'COMIC'
  /** Version 2+ only. Self-published works */
  | 'DOUJINSHI'
  /** Version 3 only. Games excluding video games */
  | 'GAME'
  /** Written work published in volumes */
  | 'LIGHT_NOVEL'
  /** Version 3 only. Live action media such as movies or TV show */
  | 'LIVE_ACTION'
  /** Asian comic book */
  | 'MANGA'
  /** Version 3 only. Multimedia project */
  | 'MULTIMEDIA_PROJECT'
  /** Version 2+ only. Written works not published in volumes */
  | 'NOVEL'
  /** An original production not based of another work */
  | 'ORIGINAL'
  /** Other */
  | 'OTHER'
  /** Version 3 only. Picture book */
  | 'PICTURE_BOOK'
  /** Video game */
  | 'VIDEO_GAME'
  /** Video game driven primary by text and narrative */
  | 'VISUAL_NOVEL'
  /** Version 3 only. Written works published online */
  | 'WEB_NOVEL';

/** The current releasing status of the media */
export type MediaStatus =
  /** Ended before the work could be finished */
  | 'CANCELLED'
  /** Has completed and is no longer being released */
  | 'FINISHED'
  /** Version 2 only. Is currently paused from releasing and will resume at a later date */
  | 'HIATUS'
  /** To be released at a later date */
  | 'NOT_YET_RELEASED'
  /** Currently releasing */
  | 'RELEASING';

/** Media type enum, anime or manga. */
export type MediaType =
  /** Japanese Anime */
  | 'ANIME'
  /** Asian comic */
  | 'MANGA';

export type AnimeDetailsQueryVariables = Exact<{
  id: number;
}>;


export type AnimeDetailsQuery = { Media: { synonyms: Array<string | null> | null, description: string | null, source: MediaSource | null, countryOfOrigin: string | null, id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, startDate: { year: number | null, month: number | null, day: number | null } | null, endDate: { year: number | null, month: number | null, day: number | null } | null, trailer: { id: string | null, site: string | null } | null, tags: Array<{ name: string, rank: number | null, isMediaSpoiler: boolean | null } | null> | null, studios: { nodes: Array<{ id: number, name: string } | null> | null } | null, relations: { edges: Array<{ relationType: MediaRelation | null, node: { type: MediaType | null, id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null } | null> | null } | null, recommendations: { nodes: Array<{ mediaRecommendation: { type: MediaType | null, id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null } | null> | null } | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null };

export type AnimeCardsQueryVariables = Exact<{
  ids: Array<number> | number;
  perPage: number;
}>;


export type AnimeCardsQuery = { Page: { media: Array<{ id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null> | null } | null };

export type BrowseAnimeQueryVariables = Exact<{
  page: number;
  perPage: number;
  search?: string | null | undefined;
  sort: Array<MediaSort> | MediaSort;
  season?: MediaSeason | null | undefined;
  seasonYear?: number | null | undefined;
  format?: Array<MediaFormat> | MediaFormat | null | undefined;
  status?: MediaStatus | null | undefined;
  genres?: Array<string> | string | null | undefined;
}>;


export type BrowseAnimeQuery = { Page: { pageInfo: { currentPage: number | null, hasNextPage: boolean | null } | null, media: Array<{ id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null> | null } | null };

export type GenresQueryVariables = Exact<{ [key: string]: never; }>;


export type GenresQuery = { GenreCollection: Array<string | null> | null };

export type AnimeCardFragment = { id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null };

export type AnimeDetailsFragment = { synonyms: Array<string | null> | null, description: string | null, source: MediaSource | null, countryOfOrigin: string | null, id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, startDate: { year: number | null, month: number | null, day: number | null } | null, endDate: { year: number | null, month: number | null, day: number | null } | null, trailer: { id: string | null, site: string | null } | null, tags: Array<{ name: string, rank: number | null, isMediaSpoiler: boolean | null } | null> | null, studios: { nodes: Array<{ id: number, name: string } | null> | null } | null, relations: { edges: Array<{ relationType: MediaRelation | null, node: { type: MediaType | null, id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null } | null> | null } | null, recommendations: { nodes: Array<{ mediaRecommendation: { type: MediaType | null, id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null } | null> | null } | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null };

export type FranchiseEntryFragment = { synonyms: Array<string | null> | null, id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, startDate: { year: number | null, month: number | null, day: number | null } | null, endDate: { year: number | null, month: number | null, day: number | null } | null, relations: { edges: Array<{ relationType: MediaRelation | null, node: { id: number, type: MediaType | null } | null } | null> | null } | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null };

export type FranchiseEntriesQueryVariables = Exact<{
  ids: Array<number> | number;
  perPage: number;
}>;


export type FranchiseEntriesQuery = { Page: { media: Array<{ synonyms: Array<string | null> | null, id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, startDate: { year: number | null, month: number | null, day: number | null } | null, endDate: { year: number | null, month: number | null, day: number | null } | null, relations: { edges: Array<{ relationType: MediaRelation | null, node: { id: number, type: MediaType | null } | null } | null> | null } | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null> | null } | null };

export type NewEntriesQueryVariables = Exact<{
  page: number;
  perPage: number;
}>;


export type NewEntriesQuery = { Page: { pageInfo: { hasNextPage: boolean | null } | null, media: Array<{ synonyms: Array<string | null> | null, id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, startDate: { year: number | null, month: number | null, day: number | null } | null, endDate: { year: number | null, month: number | null, day: number | null } | null, relations: { edges: Array<{ relationType: MediaRelation | null, node: { id: number, type: MediaType | null } | null } | null> | null } | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null> | null } | null };

export type AiringScheduleQueryVariables = Exact<{
  page: number;
  from: number;
  until: number;
}>;


export type AiringScheduleQuery = { Page: { pageInfo: { hasNextPage: boolean | null } | null, airingSchedules: Array<{ id: number, episode: number, airingAt: number, media: { id: number, idMal: number | null, bannerImage: string | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, episodes: number | null, duration: number | null, averageScore: number | null, popularity: number | null, genres: Array<string | null> | null, isAdult: boolean | null, title: { romaji: string | null, english: string | null, native: string | null } | null, coverImage: { extraLarge: string | null, large: string | null, color: string | null } | null, nextAiringEpisode: { airingAt: number, episode: number } | null } | null } | null> | null } | null };

export type SearchIndexPageQueryVariables = Exact<{
  page: number;
  sort: Array<MediaSort> | MediaSort;
  popularityBelow?: number | null | undefined;
}>;


export type SearchIndexPageQuery = { Page: { pageInfo: { hasNextPage: boolean | null } | null, media: Array<{ id: number, synonyms: Array<string | null> | null, format: MediaFormat | null, status: MediaStatus | null, season: MediaSeason | null, seasonYear: number | null, genres: Array<string | null> | null, popularity: number | null, trending: number | null, averageScore: number | null, isAdult: boolean | null, updatedAt: number | null, title: { romaji: string | null, english: string | null, native: string | null } | null, startDate: { year: number | null, month: number | null, day: number | null } | null } | null> | null } | null };

export class TypedDocumentString<TResult, TVariables>
  extends String
  implements DocumentTypeDecoration<TResult, TVariables>
{
  __apiType?: NonNullable<DocumentTypeDecoration<TResult, TVariables>['__apiType']>;
  private value: string;
  public __meta__?: Record<string, any> | undefined;

  constructor(value: string, __meta__?: Record<string, any> | undefined) {
    super(value);
    this.value = value;
    this.__meta__ = __meta__;
  }

  override toString(): string & DocumentTypeDecoration<TResult, TVariables> {
    return this.value;
  }
}
export const AnimeCardFragmentDoc = new TypedDocumentString(`
    fragment AnimeCard on Media {
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  nextAiringEpisode {
    airingAt
    episode
  }
}
    `, {"fragmentName":"AnimeCard"}) as unknown as TypedDocumentString<AnimeCardFragment, unknown>;
export const AnimeDetailsFragmentDoc = new TypedDocumentString(`
    fragment AnimeDetails on Media {
  ...AnimeCard
  synonyms
  description(asHtml: false)
  source
  countryOfOrigin
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  trailer {
    id
    site
  }
  tags {
    name
    rank
    isMediaSpoiler
  }
  studios(isMain: true) {
    nodes {
      id
      name
    }
  }
  relations {
    edges {
      relationType(version: 2)
      node {
        type
        ...AnimeCard
      }
    }
  }
  recommendations(page: 1, perPage: 12, sort: [RATING_DESC]) {
    nodes {
      mediaRecommendation {
        type
        ...AnimeCard
      }
    }
  }
}
    fragment AnimeCard on Media {
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  nextAiringEpisode {
    airingAt
    episode
  }
}`, {"fragmentName":"AnimeDetails"}) as unknown as TypedDocumentString<AnimeDetailsFragment, unknown>;
export const FranchiseEntryFragmentDoc = new TypedDocumentString(`
    fragment FranchiseEntry on Media {
  ...AnimeCard
  synonyms
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  relations {
    edges {
      relationType(version: 2)
      node {
        id
        type
      }
    }
  }
}
    fragment AnimeCard on Media {
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  nextAiringEpisode {
    airingAt
    episode
  }
}`, {"fragmentName":"FranchiseEntry"}) as unknown as TypedDocumentString<FranchiseEntryFragment, unknown>;
export const AnimeDetailsDocument = new TypedDocumentString(`
    query AnimeDetails($id: Int!) {
  Media(id: $id, type: ANIME) {
    ...AnimeDetails
  }
}
    fragment AnimeCard on Media {
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  nextAiringEpisode {
    airingAt
    episode
  }
}
fragment AnimeDetails on Media {
  ...AnimeCard
  synonyms
  description(asHtml: false)
  source
  countryOfOrigin
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  trailer {
    id
    site
  }
  tags {
    name
    rank
    isMediaSpoiler
  }
  studios(isMain: true) {
    nodes {
      id
      name
    }
  }
  relations {
    edges {
      relationType(version: 2)
      node {
        type
        ...AnimeCard
      }
    }
  }
  recommendations(page: 1, perPage: 12, sort: [RATING_DESC]) {
    nodes {
      mediaRecommendation {
        type
        ...AnimeCard
      }
    }
  }
}`) as unknown as TypedDocumentString<AnimeDetailsQuery, AnimeDetailsQueryVariables>;
export const AnimeCardsDocument = new TypedDocumentString(`
    query AnimeCards($ids: [Int!]!, $perPage: Int!) {
  Page(page: 1, perPage: $perPage) {
    media(id_in: $ids, type: ANIME) {
      ...AnimeCard
    }
  }
}
    fragment AnimeCard on Media {
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  nextAiringEpisode {
    airingAt
    episode
  }
}`) as unknown as TypedDocumentString<AnimeCardsQuery, AnimeCardsQueryVariables>;
export const BrowseAnimeDocument = new TypedDocumentString(`
    query BrowseAnime($page: Int!, $perPage: Int!, $search: String, $sort: [MediaSort!]!, $season: MediaSeason, $seasonYear: Int, $format: [MediaFormat!], $status: MediaStatus, $genres: [String!]) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      currentPage
      hasNextPage
    }
    media(
      type: ANIME
      isAdult: false
      search: $search
      sort: $sort
      season: $season
      seasonYear: $seasonYear
      format_in: $format
      status: $status
      genre_in: $genres
    ) {
      ...AnimeCard
    }
  }
}
    fragment AnimeCard on Media {
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  nextAiringEpisode {
    airingAt
    episode
  }
}`) as unknown as TypedDocumentString<BrowseAnimeQuery, BrowseAnimeQueryVariables>;
export const GenresDocument = new TypedDocumentString(`
    query Genres {
  GenreCollection
}
    `) as unknown as TypedDocumentString<GenresQuery, GenresQueryVariables>;
export const FranchiseEntriesDocument = new TypedDocumentString(`
    query FranchiseEntries($ids: [Int!]!, $perPage: Int!) {
  Page(page: 1, perPage: $perPage) {
    media(id_in: $ids, type: ANIME) {
      ...FranchiseEntry
    }
  }
}
    fragment AnimeCard on Media {
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  nextAiringEpisode {
    airingAt
    episode
  }
}
fragment FranchiseEntry on Media {
  ...AnimeCard
  synonyms
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  relations {
    edges {
      relationType(version: 2)
      node {
        id
        type
      }
    }
  }
}`) as unknown as TypedDocumentString<FranchiseEntriesQuery, FranchiseEntriesQueryVariables>;
export const NewEntriesDocument = new TypedDocumentString(`
    query NewEntries($page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      hasNextPage
    }
    media(
      type: ANIME
      isAdult: false
      status_in: [NOT_YET_RELEASED, RELEASING]
      sort: ID_DESC
    ) {
      ...FranchiseEntry
    }
  }
}
    fragment AnimeCard on Media {
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  nextAiringEpisode {
    airingAt
    episode
  }
}
fragment FranchiseEntry on Media {
  ...AnimeCard
  synonyms
  startDate {
    year
    month
    day
  }
  endDate {
    year
    month
    day
  }
  relations {
    edges {
      relationType(version: 2)
      node {
        id
        type
      }
    }
  }
}`) as unknown as TypedDocumentString<NewEntriesQuery, NewEntriesQueryVariables>;
export const AiringScheduleDocument = new TypedDocumentString(`
    query AiringSchedule($page: Int!, $from: Int!, $until: Int!) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    airingSchedules(airingAt_greater: $from, airingAt_lesser: $until, sort: [TIME]) {
      id
      episode
      airingAt
      media {
        ...AnimeCard
      }
    }
  }
}
    fragment AnimeCard on Media {
  id
  idMal
  title {
    romaji
    english
    native
  }
  coverImage {
    extraLarge
    large
    color
  }
  bannerImage
  format
  status
  season
  seasonYear
  episodes
  duration
  averageScore
  popularity
  genres
  isAdult
  nextAiringEpisode {
    airingAt
    episode
  }
}`) as unknown as TypedDocumentString<AiringScheduleQuery, AiringScheduleQueryVariables>;
export const SearchIndexPageDocument = new TypedDocumentString(`
    query SearchIndexPage($page: Int!, $sort: [MediaSort!]!, $popularityBelow: Int) {
  Page(page: $page, perPage: 50) {
    pageInfo {
      hasNextPage
    }
    media(type: ANIME, sort: $sort, popularity_lesser: $popularityBelow) {
      id
      title {
        romaji
        english
        native
      }
      synonyms
      format
      status
      season
      seasonYear
      startDate {
        year
        month
        day
      }
      genres
      popularity
      trending
      averageScore
      isAdult
      updatedAt
    }
  }
}
    `) as unknown as TypedDocumentString<SearchIndexPageQuery, SearchIndexPageQueryVariables>;