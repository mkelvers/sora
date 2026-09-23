import { z } from 'zod';

import type { AudioMode } from './audio';

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
export type AnimeCard = z.infer<typeof AnimeCardSchema>;

/** A paginated simulcast result, including whether another page can be fetched. */
export const AnimeCardPageSchema = z.object({
    anime: z.array(AnimeCardSchema),
    hasNextPage: z.boolean(),
    page: z.number().int(),
});

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
