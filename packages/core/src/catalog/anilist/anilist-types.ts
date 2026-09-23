import type { AnimeQuery, AnimeScheduleQuery } from './graphql/graphql.generated';
import { z } from 'zod';

export type AnimeMetadataField =
    | 'idMal'
    | 'title'
    | 'synonyms'
    | 'coverImage'
    | 'bannerImage'
    | 'description'
    | 'isAdult'
    | 'genres'
    | 'format'
    | 'status'
    | 'season'
    | 'seasonYear'
    | 'startDate'
    | 'endDate'
    | 'episodes'
    | 'duration'
    | 'relations'
    | 'averageScore'
    | 'popularity'
    | 'favourites'
    | 'rankings'
    | 'tags'
    | 'studios'
    | 'staff'
    | 'source'
    | 'countryOfOrigin';

export type AniListAnime = NonNullable<AnimeQuery['Media']> & {
    metadataSource?: string;
    metadataSourceId?: number | string;
    metadataFieldSources?: Partial<Record<AnimeMetadataField, string>>;
    isAdult?: boolean;
    source?: string | null;
    countryOfOrigin?: string | null;
};
export type AniListSchedule = NonNullable<AnimeScheduleQuery['Media']>;

const nullableString = z.string().nullable();
const nullableInteger = z.number().int().nullable();
const titleSchema = z
    .object({
        english: nullableString,
        romaji: nullableString,
        native: nullableString,
    })
    .nullable();
const dateSchema = z
    .object({
        year: nullableInteger,
        month: nullableInteger,
        day: nullableInteger,
    })
    .nullable();
const nextAiringSchema = z
    .object({
        airingAt: z.number().int().positive(),
        episode: z.number().int().positive(),
    })
    .nullable();

const AniListAnimeFieldsSchema = z.looseObject({
    metadataSource: z.string().min(1).optional(),
    metadataSourceId: z.union([z.number().int().positive(), z.string().min(1)]).optional(),
    metadataFieldSources: z.record(z.string(), z.string()).optional(),
    isAdult: z.boolean().optional(),
    source: z.string().nullable().optional(),
    countryOfOrigin: z.string().nullable().optional(),
    id: z.number().int().positive(),
    idMal: nullableInteger,
    title: titleSchema,
    synonyms: z.array(nullableString).nullable(),
    coverImage: z
        .object({
            extraLarge: nullableString,
            large: nullableString,
        })
        .nullable()
        .optional()
        .transform((value) => value ?? null),
    bannerImage: nullableString,
    description: nullableString,
    genres: z.array(nullableString).nullable(),
    format: nullableString,
    status: nullableString,
    season: nullableString,
    seasonYear: nullableInteger,
    startDate: dateSchema,
    endDate: dateSchema,
    episodes: nullableInteger,
    duration: nullableInteger,
    nextAiringEpisode: nextAiringSchema,
    relations: z
        .object({
            edges: z
                .array(
                    z
                        .object({
                            relationType: nullableString,
                            node: z
                                .object({
                                    id: z.number().int().positive(),
                                    idMal: nullableInteger,
                                    episodes: nullableInteger,
                                    type: nullableString,
                                    format: nullableString.optional(),
                                    title: titleSchema,
                                })
                                .nullable(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
    averageScore: z.number().nullable(),
    popularity: z.number().nullable(),
    favourites: z.number().nullable(),
    rankings: z
        .array(
            z
                .object({
                    rank: z.number(),
                    type: z.string(),
                    year: nullableInteger,
                    season: nullableString,
                    allTime: z.boolean().nullable(),
                })
                .nullable()
        )
        .nullable(),
    tags: z
        .array(
            z
                .object({
                    name: z.string(),
                    rank: z.number().nullable(),
                    isGeneralSpoiler: z.boolean().nullable(),
                    isMediaSpoiler: z.boolean().nullable(),
                })
                .nullable()
        )
        .nullable(),
    studios: z
        .object({
            nodes: z
                .array(
                    z
                        .object({
                            name: z.string(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
    staff: z
        .object({
            edges: z
                .array(
                    z
                        .object({
                            role: nullableString,
                            node: z
                                .object({
                                    name: z
                                        .object({
                                            full: nullableString,
                                        })
                                        .nullable(),
                                })
                                .nullable(),
                        })
                        .nullable()
                )
                .nullable(),
        })
        .nullable(),
});

export const AniListAnimeSchema = AniListAnimeFieldsSchema.transform(
    (value) => value as AniListAnime
);

// Older persisted releases can have only the fields used by details and progress.
// Reuse the provider field validators without requiring a complete AniList response.
const storedAnimeDetailsSchema = AniListAnimeFieldsSchema.pick({
    id: true,
    title: true,
    coverImage: true,
    bannerImage: true,
    description: true,
    genres: true,
    format: true,
    status: true,
    season: true,
    seasonYear: true,
    startDate: true,
    endDate: true,
    nextAiringEpisode: true,
    averageScore: true,
    popularity: true,
    favourites: true,
    rankings: true,
    tags: true,
    studios: true,
    staff: true,
    metadataSource: true,
    metadataFieldSources: true,
})
    .partial({ startDate: true, endDate: true })
    .extend({
        id: z.number().int(),
        nextAiringEpisode: z
            .object({
                airingAt: z.number(),
                episode: z.number(),
            })
            .nullable(),
        coverImage: AniListAnimeFieldsSchema.shape.coverImage.catch(null),
        metadataSource: AniListAnimeFieldsSchema.shape.metadataSource.catch(undefined),
        metadataFieldSources: AniListAnimeFieldsSchema.shape.metadataFieldSources.catch(undefined),
    });

export type AniListAnimeDetailsMedia = Pick<
    z.output<typeof storedAnimeDetailsSchema>,
    | 'id'
    | 'title'
    | 'bannerImage'
    | 'description'
    | 'genres'
    | 'format'
    | 'status'
    | 'season'
    | 'seasonYear'
    | 'nextAiringEpisode'
    | 'averageScore'
    | 'popularity'
    | 'favourites'
    | 'startDate'
    | 'endDate'
    | 'rankings'
    | 'tags'
    | 'studios'
    | 'staff'
    | 'metadataSource'
> & {
    metadataFieldSources?: Partial<Record<'averageScore', string>>;
};

/** Validates the details projection stored before full AniList snapshots were required. */
export function parseStoredAnimeDetails(value: unknown) {
    const parsed = storedAnimeDetailsSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}

export const AniListScheduleSchema = z
    .object({
        id: z.number().int().positive(),
        status: nullableString,
        episodes: nullableInteger,
        nextAiringEpisode: nextAiringSchema,
    })
    .transform((value) => value as AniListSchedule);
