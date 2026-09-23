import { expect, test } from 'bun:test';

import { PlaybackProgressSchema } from '../../contracts/anime';
import { normalizePlaybackProgress } from './input';

const now = Date.now();
const request = {
    animeId: 42,
    episodeId: 'episode-1',
    episodeNumber: 1,
    positionSeconds: 95,
    durationSeconds: 90,
    completed: false,
    eventAt: now,
    sessionStartedAt: now - 1_000,
};

test('normalizes validated progress and clamps the position to its duration', () => {
    const input = normalizePlaybackProgress(PlaybackProgressSchema.parse(request));

    expect(input).toEqual({
        animeId: 42,
        episodeId: 'episode-1',
        episodeNumber: 1,
        positionSeconds: 90,
        durationSeconds: 90,
        completed: false,
        eventAt: new Date(now),
        sessionStartedAt: new Date(now - 1_000),
    });
});

test('rejects checkpoints that could outrank real playback progress', () => {
    expect(
        normalizePlaybackProgress(
            PlaybackProgressSchema.parse({
                ...request,
                eventAt: now + 6 * 60_000,
            })
        )
    ).toBeNull();
    expect(
        normalizePlaybackProgress(
            PlaybackProgressSchema.parse({
                ...request,
                sessionStartedAt: now + 6 * 60_000,
            })
        )
    ).toBeNull();
    expect(
        normalizePlaybackProgress(
            PlaybackProgressSchema.parse({
                ...request,
                sessionStartedAt: now + 1,
            })
        )
    ).toBeNull();
});
