import { z } from 'zod';
import { isNotNullish } from '../collections';

const airingMediaSchema = z.object({
    id: z.number().int().positive(),

    nextAiringEpisode: z
        .object({
            airingAt: z.number().int().positive(),

            episode: z.number().int().positive(),
        })
        .nullable(),

    airingSchedule: z
        .object({
            pageInfo: z
                .object({
                    lastPage: z.number().int().positive().nullable(),
                })
                .nullable(),

            nodes: z
                .array(
                    z
                        .object({
                            airingAt: z.number().int().positive(),

                            episode: z.number().int().positive(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
});

interface AiringMediaInput {
    id?: number;

    nextAiringEpisode?: {
        airingAt?: number;
        episode?: number;
    } | null;

    airingSchedule?: {
        pageInfo?: { lastPage?: number | null } | null;

        nodes?:
            | ({
                  airingAt?: number;
                  episode?: number;
              } | null)[]
            | null;
    } | null;
}

export interface AiringAnime {
    id: number;

    nextAiringAt: number | null;

    nextAiringEpisode: number | null;

    latestAiredAt: number | null;

    latestAiredEpisode: number | null;
}

export interface AiringPageEntry extends AiringAnime {
    scheduleLastPage: number;
}

export function parseAiringMedia(value: AiringMediaInput, now: Date): AiringPageEntry {
    const parsed = airingMediaSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error('AniList returned invalid airing discovery data', {
            cause: parsed.error,
        });
    }

    const latest = parsed.data.airingSchedule?.nodes
        ?.filter(isNotNullish)
        .filter((entry) => entry.airingAt * 1_000 <= now.getTime())
        .sort((left, right) => right.airingAt - left.airingAt)[0];

    return {
        id: parsed.data.id,

        nextAiringAt: parsed.data.nextAiringEpisode?.airingAt ?? null,

        nextAiringEpisode: parsed.data.nextAiringEpisode?.episode ?? null,

        latestAiredAt: latest?.airingAt ?? null,

        latestAiredEpisode: latest?.episode ?? null,

        scheduleLastPage: parsed.data.airingSchedule?.pageInfo?.lastPage ?? 1,
    };
}
