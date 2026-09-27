import { query } from '$app/server';
import { z } from 'zod';
import { sora } from '$lib/server/sora';

export const searchSeries = query(
	z.object({
		q: z.string().trim().min(1),
		page: z.number().int().positive().max(500).default(1),
		perPage: z.number().int().min(1).max(50).default(24)
	}),
	({ q, page, perPage }) =>
		sora.search(q, {
			params: {
				page,
				per_page: perPage
			},
			meta: true
		})
);
