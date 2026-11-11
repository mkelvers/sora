import { query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { sourceValues } from "$routes/(app)/(catalog)/browse/browse.svelte";
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
		countries: z.array(z.string().regex(/^[A-Z]{2}$/u)).max(10),
		genres: z.array(z.string().min(1).max(100)).max(10),
		hideMature: z.boolean(),
		kind: z.literal("browse"),
		maxEpisodes: z.number().int().positive().optional(),
		minEpisodes: z.number().int().positive().optional(),
		sort: z.enum(["popular", "trending", "score", "newest", "title"]),
		sources: z.array(z.enum(sourceValues)).max(sourceValues.length),
		studios: z.array(z.string().min(1).max(100)).max(10),
		tags: z.array(z.string().min(1).max(100)).max(10),
		yearFrom: z.number().int().min(1940).max(2100).optional(),
		yearTo: z.number().int().min(1940).max(2100).optional(),
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

export const getTags = query(async () => await remoteViewer().sora.request(route.listTags));

export const getStudios = query(
	z.string().trim().max(100),
	async (q) =>
		await remoteViewer().sora.request(route.listStudios, {
			query: {
				q: q || undefined,
			},
		}),
);

export const getDecades = query(async () => {
	const seasons = await remoteViewer().sora.request(route.listSeasons);
	return [...new Set(seasons.map((season) => Math.floor(season.year / 10) * 10))].toSorted(
		(left, right) => right - left,
	);
});

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

	if (input.kind === "browse") {
		const { results, meta } = await sora.requestWithMeta(route.browseSeries, {
			query: {
				audio: input.audio,
				countries: input.countries,
				format: input.format && [...formats[input.format]],
				genres: input.genres,
				hide_mature: input.hideMature || undefined,
				max_episodes: input.maxEpisodes,
				min_episodes: input.minEpisodes,
				sort: input.sort,
				sources: input.sources,
				studios: input.studios,
				tags: input.tags,
				year_from: input.yearFrom,
				year_to: input.yearTo,
				...paging,
			},
		});

		return {
			hasNextPage: meta.has_next_page,
			items: results.map((card): CatalogItem => ({
				card,
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
