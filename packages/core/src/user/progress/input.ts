import type { z } from 'zod';

import type { PlaybackProgressSchema } from '../../contracts/anime';

export interface PlaybackProgressInput {
    animeId: number;
    episodeId: string;
    episodeNumber: number;
    positionSeconds: number;
    durationSeconds: number;
    completed: boolean;
    eventAt: Date;
    sessionStartedAt: Date;
}

/** Converts an already validated API payload into a safe persisted checkpoint. */
export function normalizePlaybackProgress(
    value: z.infer<typeof PlaybackProgressSchema>
): PlaybackProgressInput | null {
    if (
        // Allow small client clock skew, but reject future checkpoints that
        // could otherwise win conflict resolution over real playback progress.
        value.eventAt > Date.now() + 5 * 60 * 1_000 ||
        value.sessionStartedAt > Date.now() + 5 * 60 * 1_000 ||
        value.sessionStartedAt > value.eventAt
    ) {
        return null;
    }

    return {
        animeId: value.animeId,
        episodeId: value.episodeId,
        episodeNumber: value.episodeNumber,
        // Clamp browser-reported position so malformed clients cannot persist a
        // checkpoint beyond the episode's own reported duration.
        positionSeconds: Math.min(value.positionSeconds, value.durationSeconds),
        durationSeconds: value.durationSeconds,
        completed: value.completed,
        eventAt: new Date(value.eventAt),
        sessionStartedAt: new Date(value.sessionStartedAt),
    };
}
