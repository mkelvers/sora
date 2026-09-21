import { z } from 'zod';

export const WatchlistStateSchema = z.enum(['watching', 'plan_to_watch', 'completed', 'dropped']);

export const WatchlistSelectionSchema = z.object({
    state: WatchlistStateSchema.or(z.literal('all')),
    sort: z.enum(['updated', 'added', 'alphabetical']),
    order: z.enum(['newest', 'oldest']),
    language: z.enum(['all', 'sub', 'dub']),
    media: z.enum(['all', 'series', 'movie']),
    type: z.enum(['all', 'airing', 'finished', 'not_yet_released', 'cancelled', 'hiatus']),
});

export const WatchlistUpdateSchema = z.object({
    state: WatchlistStateSchema,
    title: z.string().trim().min(1).max(512).optional(),
});

export type WatchlistState = z.infer<typeof WatchlistStateSchema>;
export type WatchlistSelection = z.infer<typeof WatchlistSelectionSchema>;
