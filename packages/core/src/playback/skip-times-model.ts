import { z } from 'zod';

export type SkipKind = 'opening' | 'ending';
const SkipTimesSourceSchema = z.enum(['anikoto', 'aniskip', 'manual']);

/** Rejects invalid provider intervals before they reach playback or persistence. */
export const SkipIntervalSchema = z
    .object({
        start: z.number().nonnegative(),
        end: z.number().positive(),
    })
    .refine(({ start, end }) => end > start);

export type SkipInterval = z.infer<typeof SkipIntervalSchema>;

/** Tracks the source of each segment so automatic refreshes preserve manual edits. */
export const EpisodeSkipTimesSchema = z.object({
    opening: SkipIntervalSchema.nullable(),
    ending: SkipIntervalSchema.nullable(),
    sources: z.object({
        opening: SkipTimesSourceSchema.nullable(),
        ending: SkipTimesSourceSchema.nullable(),
    }),
});

export type EpisodeSkipTimes = z.infer<typeof EpisodeSkipTimesSchema>;

type SegmentTemplate = {
    fromEpisode: number;
    duration: number;
};

export type SegmentTemplates = Record<SkipKind, SegmentTemplate | null>;

/** Returns `null` for an invalid duration or arithmetic overflow. */
export function intervalFromTemplate(start: number, duration: number): SkipInterval | null {
    const end = start + duration;
    if (
        !Number.isFinite(start) ||
        !Number.isFinite(duration) ||
        !Number.isFinite(end) ||
        start < 0 ||
        duration <= 0
    ) {
        return null;
    }

    return {
        start,
        end,
    };
}
