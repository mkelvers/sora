import { z } from 'zod';

import { AnimeCardSchema } from '../../types';

const franchiseOrderSchema = z.object({
    types: z.array(
        z.object({
            id: z.string(),
            label: z.string(),
        })
    ),
    entries: z.array(
        AnimeCardSchema.omit({ releasedAt: true, episode: true })
            .required({ format: true, status: true })
            .extend({
                id: z.number(),
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
});

/** Persisted franchise order, inferred from the schema that validates stored JSON. */
export type FranchiseOrder = z.infer<typeof franchiseOrderSchema>;

export const FranchiseRecordSchema = z.object({
    order: franchiseOrderSchema,
    membershipSource: z.literal('chiaki'),
    identitySource: z.literal('arc'),
    anilistVerifiedAt: z
        .string()
        .refine((value) => !Number.isNaN(Date.parse(value)), 'Invalid verification timestamp'),
});
