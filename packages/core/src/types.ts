import { z } from 'zod';

import type { AudioMode } from './audio';
import type {
    MediaFormat,
    MediaRelation,
    MediaStatus,
} from './catalog/anilist/graphql/graphql.generated';

/** Runtime contract for an anime card returned by catalog sources. */
export const AnimeCardSchema = z.object({
    id: z.number().int().positive(),
    title: z.string(),
    image: z.string(),
    audio: z.array(z.enum(['sub', 'dub', 'raw'])),
    format: z.string().nullable().optional(),
    status: z.string().nullable().optional(),
    score: z.number(),
    genres: z.array(z.string()),
    synopsis: z.string(),
    releasedAt: z.iso.datetime().optional(),
    episode: z.number().int().positive().optional(),
});

/** Anime card shape accepted from a catalog source after runtime validation. */
export interface AnimeCard {
    id: number;
    title: string;
    image: string;
    audio: AudioMode[];
    format?: string | null;
    status?: string | null;
    score: number;
    genres: string[];
    synopsis: string;
    releasedAt?: string;
    episode?: number;
}

/** A paginated simulcast result, including whether another page can be fetched. */
export const AnimeCardPageSchema = z.object({
    anime: z.array(AnimeCardSchema),
    hasNextPage: z.boolean(),
    page: z.number().int(),
});

/** Validated page of catalog cards; `page` is the source's current page number. */
export interface AnimeCardPage {
    anime: AnimeCard[];
    hasNextPage: boolean;
    page: number;
}

/** Provider episode data normalized for playback and progress tracking. */
export type AnimeEpisode = {
    id: string;
    number: number;
    title: string;
    audio: AudioMode[];
    image: string | null;
    duration: string;
    releaseDate: string;
    overview: string;
    /** Absent when progress was not requested; null when no checkpoint exists. */
    progress?: {
        positionSeconds: number;
        durationSeconds: number;
        completed: boolean;
        hasCompleted: boolean;
        completedAt: string | null;
    } | null;
};

/** Runtime shape for a cached episode-source revision, which may be unknown. */
export const EpisodeRevisionSchema = z.object({
    revision: z.string().nullable(),
});

/** Episode artwork and resume state used to build a continue-watching card. */
export type ContinueWatchingCard = {
    animeId: number;
    title: string;
    backdrop: string;
    episodeImage: string;
    audio: AudioMode[];
    duration: string;
    resumeAtSeconds: number;
    progress: Pick<
        NonNullable<AnimeEpisode['progress']>,
        'positionSeconds' | 'durationSeconds' | 'completed'
    > | null;
};

/** Ordered franchise entries enriched with identifiers and relation metadata. */
/**
 * Franchise display order and its catalog entries.
 *
 * `primary` and `secondary` distinguish the focal anime from related entries;
 * source relation metadata is retained so callers can present the order's basis.
 */
export type FranchiseOrder = {
    types: {
        id: string;
        label: string;
    }[];
    entries: (AnimeCard & {
        malId: number;
        anilistId: number;
        type: string;
        format: MediaFormat | null;
        status: MediaStatus | null;
        episodes: number | null;
        duration: number | null;
        popularity: number | null;
        relations: {
            type: MediaRelation;
            malId: number;
        }[];
        secondary: boolean;
        primary: boolean;
    })[];
};
