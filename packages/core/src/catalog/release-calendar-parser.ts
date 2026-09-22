import { z } from 'zod';
import type { ReleaseCalendarPageQuery } from './anilist/graphql/graphql.generated';
import { mediaTitle, plainText } from './anilist/anilist-text';

const releaseCalendarPageSchema = z.object({
    Page: z.object({
        pageInfo: z.object({
            hasNextPage: z.boolean(),
        }),
        airingSchedules: z.array(
            z
                .object({
                    id: z.number().int().positive(),
                    episode: z.number().int().positive(),
                    airingAt: z
                        .number()
                        .int()
                        .positive()
                        .refine((value) => Number.isFinite(new Date(value * 1_000).getTime())),
                    media: z
                        .object({
                            id: z.number().int().positive(),
                            isAdult: z.boolean().nullable(),
                            description: z.string().nullable(),
                            title: z
                                .object({
                                    english: z.string().nullable(),
                                    romaji: z.string().nullable(),
                                    native: z.string().nullable(),
                                })
                                .nullable(),
                            coverImage: z
                                .object({
                                    extraLarge: z.string().nullable(),
                                    large: z.string().nullable(),
                                })
                                .nullable(),
                        })
                        .nullable(),
                })
                .nullable()
        ),
    }),
});

type DeepPartial<T> = T extends (infer Item)[]
    ? DeepPartial<Item>[]
    : T extends null
      ? null
      : T extends object
        ? { [Key in keyof T]?: DeepPartial<T[Key]> }
        : T;

type ReleaseCalendarPageInput = DeepPartial<{
    Page: {
        pageInfo: {
            hasNextPage: boolean;
        };
        airingSchedules: ({
            id: number;
            episode: number;
            airingAt: number;
            media: {
                id: number;
                isAdult: boolean | null;
                description: string | null;
                title: {
                    english: string | null;
                    romaji: string | null;
                    native: string | null;
                } | null;
                coverImage: {
                    extraLarge: string | null;
                    large: string | null;
                } | null;
            } | null;
        } | null)[];
    };
}>;

export type ReleaseCalendarEntry = {
    airingId: number;
    anilistId: number;
    episode: number;
    airingAt: Date;
    title: string;
    synopsis: string | null;
    imageUrl: string | null;
};

export function parseReleaseCalendarPage(
    response: ReleaseCalendarPageQuery | ReleaseCalendarPageInput
) {
    const parsed = releaseCalendarPageSchema.safeParse(response);
    if (!parsed.success) {
        throw new Error('AniList returned invalid release calendar data', {
            cause: parsed.error,
        });
    }

    const entries = parsed.data.Page.airingSchedules.flatMap((entry) => {
        if (!entry?.media || entry.media.isAdult !== false) {
            return [];
        }

        return [
            {
                airingId: entry.id,
                anilistId: entry.media.id,
                episode: entry.episode,
                airingAt: new Date(entry.airingAt * 1_000),
                title: mediaTitle(entry.media),
                synopsis: entry.media.description
                    ? plainText(entry.media.description) || null
                    : null,
                imageUrl:
                    entry.media.coverImage?.extraLarge ?? entry.media.coverImage?.large ?? null,
            },
        ];
    });

    return {
        entries,
        hasNextPage: parsed.data.Page.pageInfo.hasNextPage,
    };
}
