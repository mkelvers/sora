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

export interface BrowseFilters {
    query: string;
    safe: boolean;
    genre: string | null;
    tag: string | null;
    status: string | null;
    format: string | null;
    source: string | null;
    season: string | null;
    year: number | null;
    country: string | null;
    audio: 'sub' | 'dub' | null;
    sort: 'popularity' | 'score';
    order: 'asc' | 'desc';
}

export function parseBrowseFilters(searchParams: URLSearchParams): BrowseFilters | null {
    const result = BrowseFiltersCodec.safeParse(
        Object.fromEntries(
            BrowseSearchSchema.keyof().options.map((name) => [name, searchParams.get(name)])
        )
    );

    return result.success ? result.data : null;
}

export function browseSearchParams(filters: BrowseFilters) {
    const encoded = z.encode(BrowseFiltersCodec, {
        ...filters,
        query: filters.query.trim().slice(0, 200),
    });

    return new URLSearchParams(
        Object.entries(encoded).flatMap(([name, value]) =>
            value === null ? [] : [[name, String(value)]]
        )
    );
}
