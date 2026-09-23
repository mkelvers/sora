import { z } from 'zod';

const metadataSchema = z.string().trim().min(1).max(64).nullable();
const browseMetadata = {
    genre: metadataSchema,
    tag: metadataSchema,
    status: metadataSchema,
    format: metadataSchema,
    source: metadataSchema,
    season: metadataSchema,
} as const;

const BrowseSearchSchema = z.object({
    q: z.string().trim().max(200).nullable(),
    sfw: z
        .stringbool({
            truthy: ['1'],
            falsy: ['0'],
        })
        .nullable(),
    ...browseMetadata,
    year: z
        .string()
        .regex(/^\d{4}$/)
        .nullable(),
    country: z
        .string()
        .trim()
        .regex(/^[A-Z]{2}$/)
        .nullable(),
    audio: z.enum(['sub', 'dub']).nullable(),
    sort: z.enum(['popularity', 'score']).nullable(),
    order: z.enum(['asc', 'desc']).nullable(),
});

const BrowseFiltersSchema = z
    .object({
        query: z.string().max(200),
        safe: z.boolean(),
        ...browseMetadata,
        year: z.number().int().min(1900).nullable(),
        country: z
            .string()
            .trim()
            .regex(/^[A-Z]{2}$/)
            .nullable(),
        audio: z.enum(['sub', 'dub']).nullable(),
        sort: z.enum(['popularity', 'score']),
        order: z.enum(['asc', 'desc']),
    })
    .refine(({ genre, tag }) => genre === null || tag === null);

const BrowseFiltersCodec = z.codec(BrowseSearchSchema, BrowseFiltersSchema, {
    decode: ({ q, sfw, year, sort, order, ...filters }) => ({
        ...filters,
        query: q ?? '',
        safe: sfw ?? true,
        year: year === null ? null : Number(year),
        sort: sort ?? 'popularity',
        order: order ?? 'desc',
    }),
    encode: ({ query, safe, year, sort, order, ...filters }) => ({
        ...filters,
        q: query || null,
        sfw: safe ? null : false,
        year: year?.toString() ?? null,
        sort: sort === 'popularity' ? null : sort,
        order: order === 'desc' ? null : order,
    }),
});

export type BrowseFilters = z.infer<typeof BrowseFiltersSchema>;

export function parseBrowseFilters(searchParams: URLSearchParams): BrowseFilters | null {
    const result = BrowseFiltersCodec.safeParse(
        Object.fromEntries(
            BrowseSearchSchema.keyof().options.map((name) => [name, searchParams.get(name)])
        )
    );

    return result.success ? result.data : null;
}
