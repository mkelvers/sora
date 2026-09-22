import { Buffer } from 'node:buffer';
import { z } from 'zod';

import { WatchPlaybackSchema } from '@soraorg/core/contracts/anime';
import { EpisodeSkipTimesSchema } from '@soraorg/core/player/skip-times';

const playbackInputSchema = z.strictObject({
    error: z.boolean(),
    skipTimes: EpisodeSkipTimesSchema.nullable().optional(),
    streams: z.record(z.string(), z.array(z.unknown())),
});

type PlaybackResponseInput = Omit<z.input<typeof playbackInputSchema>, 'streams'> & {
    streams: object;
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
