import { getRequestEvent, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { z } from 'zod';
import { sora } from '$lib/server/sora';

export const searchSeries = query(
	z.object({
		q: z.string().trim().min(1),
		page: z.number().int().positive().max(500).default(1),
		perPage: z.number().int().min(1).max(50).default(24)
	}),
	async ({ q, page, perPage }) => {
		const { viewer } = getRequestEvent().locals;
		if (!viewer?.profile) {
			error(403, 'Choose a profile first');
		}

		const found = await sora.search(q, {
			params: {
				page,
				per_page: perPage
			},
			meta: true
		});

		const resumes =
			found.results.length > 0
				? await viewer.sora.continueWatching(viewer.profile.id, {
						params: {
							series_id: found.results.map((card) => card.id)
						}
					})
				: [];

		return {
			...found,
			resumes: Object.fromEntries(resumes.map((resume) => [resume.series.id, resume]))
		};
	}
);
