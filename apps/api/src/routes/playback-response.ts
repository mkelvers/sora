import { Buffer } from 'node:buffer';
import { z } from 'zod';

import {
    PlaybackStreamSchema,
    WatchPlaybackSchema,
    type PlaybackStream,
} from '@soraorg/core/contracts/anime';
import {
    EpisodeSkipTimesSchema,
    type EpisodeSkipTimes,
} from '@soraorg/core/playback/skip-times-model';

const playbackInputSchema = z.strictObject({
    error: z.boolean(),
    skipTimes: EpisodeSkipTimesSchema.nullable().optional(),
    streams: z.record(z.string(), z.array(PlaybackStreamSchema)),
});

type PlaybackResponseInput = {
    error: boolean;
    skipTimes?: EpisodeSkipTimes | null;
    streams: Record<string, PlaybackStream[]>;
};

export function playbackResponse(value: PlaybackResponseInput) {
    const input = playbackInputSchema.parse(value);
    const validated = WatchPlaybackSchema.parse({
        ...input,
        skipTimes: input.skipTimes ?? null,
        streams: {
            ...input.streams,
            sub: input.streams.sub ?? [],
            dub: input.streams.dub ?? [],
            raw: input.streams.raw ?? [],
        },
    });

    return {
        ...validated,
        streams: Object.fromEntries(
            Object.entries(validated.streams).map(([mode, sources]) => [
                mode,
                sources.map((source) => ({
                    ...source,
                    url: `/v1/stream?${new URLSearchParams({
                        src: Buffer.from(source.url).toString('base64url'),
                    })}`,
                    subtitles: source.subtitles.map((subtitle) => ({
                        ...subtitle,
                        url: `/v1/stream?${new URLSearchParams({
                            src: Buffer.from(subtitle.url).toString('base64url'),
                        })}`,
                    })),
                })),
            ])
        ),
    };
}
