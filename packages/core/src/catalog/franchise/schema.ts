import { z } from 'zod';

import type { AnimeCard } from '../../types';
import type { MediaFormat, MediaRelation, MediaStatus } from '../anilist/graphql/graphql.generated';

/** Franchise order stored with provider and verification metadata. */
export type FranchiseOrder = {
    types: {
        id: string;
        label: string;
    }[];
    entries: (AnimeCard & {
        malId: number;
        anilistId: number;
        type: string;
        format: MediaFormat | null;
        status: MediaStatus | null;
        episodes: number | null;
        duration: number | null;
        popularity: number | null;
        relations: {
            type: MediaRelation;
            malId: number;
        }[];
        secondary: boolean;
        primary: boolean;
    })[];
};

const franchiseOrderSchema = z
    .object({
        types: z.array(
            z.object({
                id: z.string(),
                label: z.string(),
            })
        ),
        entries: z.array(
            z.object({
                id: z.number(),
                title: z.string(),
                image: z.string(),
                audio: z.array(z.enum(['sub', 'dub', 'raw'])),
                format: z.string().nullable(),
                status: z.string().nullable(),
                score: z.number(),
                genres: z.array(z.string()),
                synopsis: z.string(),
                malId: z.number(),
                anilistId: z.number(),
                type: z.string(),
                episodes: z.number().nullable(),
                duration: z.number().nullable(),
                popularity: z.number().nullable(),
                relations: z.array(
                    z.object({
                        type: z.string(),
                        malId: z.number(),
                    })
                ),
                secondary: z.boolean(),
                primary: z.boolean(),
            })
        ),
    })
    .transform((value) => value as FranchiseOrder);

export const FranchiseRecordSchema = z.object({
    order: franchiseOrderSchema,
    membershipSource: z.literal('chiaki'),
    identitySource: z.literal('arc'),
    anilistVerifiedAt: z
        .string()
        .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid verification timestamp'),
});
