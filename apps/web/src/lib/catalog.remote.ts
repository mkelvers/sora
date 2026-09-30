import { query } from "$app/server";
import { remoteViewer, sora } from "$lib/server/sora";
import type { SeriesCard } from "@sora/sdk";
import { z } from "zod";

const filters = {
	audio: z.enum(["sub", "dub"]).optional(),
	format: z.enum(["TV", "MOVIE"]).optional(),
	page: z.number().int().positive().max(500),
};

const formats = {
	TV: ["TV", "TV_SHORT", "ONA"],
	MOVIE: ["MOVIE"],
} as const;

export type CatalogItem = {
	key: string;
	card: SeriesCard;
	release?: {
		episode: number;
		released_at: string;
	};
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
		season: z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]),
		year: z.number().int().min(1940).max(2100),
		page: z.number().int().positive().max(500),
	}),
	z.object({
		kind: z.literal("genre"),
		genre: z.string().min(1).max(100),
		...filters,
	}),
]);

type WithoutPage<TRequest> = TRequest extends unknown ? Omit<TRequest, "page"> : never;

export type CatalogRequest = WithoutPage<z.input<typeof request>>;

export const getGenres = query(async () => sora.genres());

export const getCatalogPage = query(request, async (input) => {
	const viewer = remoteViewer();
	const loadedAt = new Date().toISOString();

	const found =
		input.kind === "new"
			? await sora.releases({
					params: {
						audio: input.audio,
						format: input.format && [...formats[input.format]],
						page: input.page,
						per_page: 36,
					},
					meta: true,
				})
			: await sora.browse({
					params:
						input.kind === "popular" || input.kind === "genre"
							? {
									sort: "popular",
									genres: input.kind === "genre" ? [input.genre] : undefined,
									audio: input.audio,
									format: input.format && [...formats[input.format]],
									page: input.page,
									per_page: 36,
								}
							: {
									sort: "popular",
									season: input.season,
									season_year: input.year,
									format: [...formats.TV],
									page: input.page,
									per_page: 36,
								},
					meta: true,
				});

	const items: CatalogItem[] = found.results.map((result) =>
		"series" in result
			? {
					key: result.series.id,
					card: result.series,
					release: {
						episode: result.episode,
						released_at: result.released_at,
					},
				}
			: {
					key: result.id,
					card: result,
				},
	);
	const seriesIds = items.map((item) => item.card.id);
	const resumes =
		seriesIds.length > 0
			? await viewer.sora.continueWatching(viewer.profile.id, {
					params: {
						series_id: seriesIds,
					},
				})
			: [];

	return {
		items,
		hasNextPage: found.meta.has_next_page,
		preparing: found.meta.preparing,
		loadedAt,
		resumes: Object.fromEntries(resumes.map((resume) => [resume.series.id, resume])),
	};
});
