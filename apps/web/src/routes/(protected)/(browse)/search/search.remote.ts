import { query } from "$app/server";
import { remoteViewer, sora } from "$lib/server/sora";
import { z } from "zod";

export const searchSeries = query(
	z.object({
		q: z.string().trim(),
		page: z.number().int().positive().max(500).default(1),
		perPage: z.number().int().min(1).max(50).default(24),
	}),
	async ({ q, page, perPage }) => {
		if (!q) {
			return {
				results: [],
				meta: {
					page,
					per_page: perPage,
					has_next_page: false,
					next: null,
					previous: null,
					preparing: false,
					preparing_titles: [],
				},
				resumes: {},
			};
		}

		const viewer = remoteViewer();

		const found = await sora.search(q, {
			params: {
				page,
				per_page: perPage,
			},
			meta: true,
		});

		const resumes =
			found.results.length > 0
				? await viewer.sora.continueWatching(viewer.profile.id, {
						params: {
							series_id: found.results.map((card) => card.id),
						},
					})
				: [];

		return {
			...found,
			resumes: Object.fromEntries(resumes.map((resume) => [resume.series.id, resume])),
		};
	},
);
