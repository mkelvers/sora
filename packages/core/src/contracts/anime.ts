import { z } from 'zod';

import { EpisodeSkipTimesSchema } from '../player/skip-times';

/** Accepts numeric path parameters while rejecting non-positive or fractional IDs. */
export const AnimeIdSchema = z.coerce.number().int().positive();

export const SearchQuerySchema = z.object({
    q: z.string().trim().max(200).default(''),
});

export const PageQuerySchema = z.object({
    page: z.coerce.number().int().positive().default(1),
});

/**
 * Calendar response contract. `airingId` is numeric for provider schedule rows
 * and `target:<anime>:<episode>` for synthesized entries without a schedule ID.
 */
export const ReleaseCalendarSchema = z.object({
    events: z.array(
        z.object({
            airingId: z.union([z.number().int().positive(), z.string().regex(/^target:\d+:\d+$/)]),
            anilistId: AnimeIdSchema,
            episode: z.number().int().positive(),
            airingAt: z.iso.datetime(),
            title: z.string(),
            synopsis: z.string().nullable(),
            image: z.string().nullable(),
        })
    ),
    refreshedAt: z.iso.datetime().nullable(),
});

const ArtworkImageSchema = z.object({
    aspectRatio: z.number(),
    filePath: z.string(),
    height: z.number().int(),
    language: z.string().nullable(),
    url: z.string(),
    voteAverage: z.number(),
    width: z.number().int(),
});

const ArtworkSchema = z.object({
    id: z.number().int(),
    mediaType: z.enum(['movie', 'tv']),
    backdrops: z.array(ArtworkImageSchema),
    logos: z.array(ArtworkImageSchema),
    selectedBackdrop: ArtworkImageSchema.nullable(),
    selectedLogo: ArtworkImageSchema.nullable(),
    selectedPoster: ArtworkImageSchema.nullable(),
    logoHidden: z.boolean(),
    logoSize: z.number(),
});

export const AnimeArtworkSchema = ArtworkSchema.nullable();

export interface PlaybackSubtitle {
    kind: 'full' | 'sdh' | 'forced';
    url: string;
}

export interface PlaybackStream {
    provider: string;
    server: string;
    url: string;
    quality: string | null;
    subtitles: PlaybackSubtitle[];
}

export const PlaybackStreamSchema = z.strictObject({
    provider: z.string(),
    server: z.string(),
    url: z.string(),
    quality: z.string().nullable(),
    subtitles: z.array(
        z.strictObject({
            kind: z.enum(['full', 'sdh', 'forced']),
            url: z.string(),
        })
    ),
});

export const WatchPlaybackSchema = z.object({
    error: z.boolean(),
    skipTimes: EpisodeSkipTimesSchema.nullable(),
    streams: z.strictObject({
        sub: z.array(PlaybackStreamSchema),
        dub: z.array(PlaybackStreamSchema),
        raw: z.array(PlaybackStreamSchema),
    }),
});

export const PlaybackProgressSchema = z.object({
    animeId: z.number().int().positive(),
    episodeId: z.string().trim().min(1).max(512),
    episodeNumber: z.number().min(-1_000_000).max(1_000_000),
    positionSeconds: z.number().nonnegative(),
    durationSeconds: z
        .number()
        .positive()
        .max(7 * 24 * 60 * 60),
    completed: z.boolean(),
    eventAt: z.number().int().nonnegative(),
    sessionStartedAt: z.number().int().nonnegative(),
});

const SegmentFields = {
    anilistId: z.number().int().positive(),
    episodeId: z.string().trim().min(1).max(512),
    kind: z.enum(['opening', 'ending']),
};

/**
 * Manual skip-segment mutations. `apply-template` derives an interval from the
 * latest earlier template; `set` stores an explicit interval and may create one.
 */
export const SegmentRequestSchema = z.discriminatedUnion('operation', [
    z.object({
        ...SegmentFields,
        operation: z.literal('clear'),
    }),
    z.object({
        ...SegmentFields,
        operation: z.literal('apply-template'),
        start: z.number().nonnegative(),
    }),
    z.object({
        ...SegmentFields,
        operation: z.literal('set'),
        interval: z.object({
            start: z.number().nonnegative(),
            end: z.number().positive(),
        }),
        createTemplate: z.boolean(),
    }),
]);
