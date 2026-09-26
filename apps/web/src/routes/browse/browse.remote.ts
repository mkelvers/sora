import { query } from '$app/server';
import { z } from 'zod';
import { fromSora, sora } from '$lib/server/sora';

const Filters = z.object({
	sort: z.enum(['trending', 'popular', 'score', 'newest']).optional(),
	season: z.enum(['WINTER', 'SPRING', 'SUMMER', 'FALL']).optional(),
	season_year: z.number().int().optional(),
	status: z.enum(['RELEASING', 'FINISHED', 'NOT_YET_RELEASED']).optional(),
	genres: z.array(z.string()).optional()
});

export type Filters = z.infer<typeof Filters>;

export const getBrowse = query(
	Filters.extend({
		page: z.number().int().positive().default(1),
		per_page: z.number().int().positive().max(50).default(24)
	}),
	(params) => fromSora(() => sora.browse({ params, meta: true }))
);

export const getGenres = query(() => fromSora(() => sora.genres()));
