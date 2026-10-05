import { query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

const formats = {
	TV: "Series",
	TV_SHORT: "Short",
	MOVIE: "Movie",
	SPECIAL: "Special",
	OVA: "OVA",
	ONA: "ONA",
	MUSIC: "Music",
};

const statuses = {
	RELEASING: "Airing",
	NOT_YET_RELEASED: "Upcoming",
};

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
			};
		}

		remoteViewer();

		const found = await remoteViewer().sora.requestWithMeta(route.searchSeries, {
			query: {
				q,
				page,
				per_page: perPage,
			},
		});

		return {
			...found,
			results: found.results.map((card) => ({
				...card,
				description: [
					card.year,
					card.format && formats[card.format],
					card.status && statuses[card.status as keyof typeof statuses],
				]
					.filter((part) => !!part)
					.join(" · "),
			})),
		};
	},
);
