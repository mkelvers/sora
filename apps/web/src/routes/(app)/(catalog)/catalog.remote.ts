import { query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import type { SeriesCard } from "@sora/sdk";
import { z } from "zod";

const filters = {
	audio: z.enum(["sub", "dub"]).optional(),
	format: z.enum(["TV", "MOVIE"]).optional(),
	page: z.number().int().positive().max(500),
};

const request = z.discriminatedUnion("kind", [
	z.object({
		kind: z.literal("new"),
		...filters,
	}),
	z.object({
		kind: z.literal("popular"),
		...filters,
	}),
	z.object({
		kind: z.literal("simulcast"),
		page: z.number().int().positive().max(500),
		season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]),
		year: z.number().int().min(1940).max(2100),
	}),
	z.object({
		genre: z.string().min(1).max(100),
		kind: z.literal("genre"),
		...filters,
	}),
]);

type WithoutPage<TRequest> = TRequest extends unknown ? Omit<TRequest, "page"> : never;

export type CatalogRequest = WithoutPage<z.input<typeof request>>;

export interface CatalogItem {
	card: SeriesCard;
	meta?: string;
	group?: string;
}

const formats = {
	MOVIE: ["MOVIE"],
	TV: ["TV", "TV_SHORT", "ONA"],
} as const;

export const getGenres = query(async () => await remoteViewer().sora.request(route.listGenres));

export const getCatalogPage = query(request, async (input) => {
	const { sora } = remoteViewer();
	const paging = {
		page: input.page,
		per_page: 36,
	};

	if (input.kind === "new") {
		const { results, meta } = await sora.requestWithMeta(route.listReleases, {
			query: {
				audio: input.audio,
				format: input.format && [...formats[input.format]],
				...paging,
			},
		});

		return {
			hasNextPage: meta.has_next_page,
			items: results.map((release): CatalogItem => ({
				card: release.series,
				group: release.period,
				meta: release.released_ago,
			})),
			preparing: meta.preparing,
		};
	}

	const { results, meta } = await sora.requestWithMeta(route.browseSeries, {
		query:
			input.kind === "simulcast"
				? {
						format: [...formats.TV],
						season: input.season,
						season_year: input.year,
						sort: "popular",
						...paging,
					}
				: {
						audio: input.audio,
						format: input.format && [...formats[input.format]],
						genres: input.kind === "genre" ? [input.genre] : undefined,
						sort: "popular",
						...paging,
					},
	});

	return {
		hasNextPage: meta.has_next_page,
		items: results.map((card): CatalogItem => ({
			card,
			group: input.kind === "popular" ? "Popular" : undefined,
		})),
		preparing: meta.preparing,
	};
});
