import { query } from "$app/server";
import { remoteViewer, sora } from "$lib/server/sora";
import { route, type SeriesCard } from "@sora/sdk";
import { z } from "zod";

const filters = {
	audio: z.enum(["sub", "dub"]).optional(),
	format: z.enum(["TV", "MOVIE"]).optional(),
	page: z.number().int().positive().max(500),
};

const day = 24 * 60 * 60 * 1000;

const relativeTime = new Intl.RelativeTimeFormat("en", {
	numeric: "always",
});

const formats = {
	TV: ["TV", "TV_SHORT", "ONA"],
	MOVIE: ["MOVIE"],
} as const;

export type CatalogItem = {
	key: string;
	card: SeriesCard;
	meta?: string;
	group?: string;
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

export const getGenres = query(async () => sora.request(route.listGenres));

export const getCatalogPage = query(request, async (input) => {
	remoteViewer();
	const now = Date.now();

	const found =
		input.kind === "new"
			? await sora.requestWithMeta(route.listReleases, {
					query: {
						audio: input.audio,
						format: input.format && [...formats[input.format]],
						page: input.page,
						per_page: 36,
					},
				})
			: await sora.requestWithMeta(route.browseSeries, {
					query:
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
				});

	const items: CatalogItem[] = found.results.map((result) => {
		if (!("series" in result)) {
			return {
				key: result.id,
				card: result,
				group: input.kind === "popular" ? "Popular" : undefined,
			};
		}

		const age = Math.max(0, now - Date.parse(result.released_at));
		const minutes = Math.floor(age / 60_000);
		const hours = Math.floor(minutes / 60);
		return {
			key: result.series.id,
			card: result.series,
			meta:
				minutes < 60
					? relativeTime.format(-Math.max(1, minutes), "minute")
					: hours < 24
						? relativeTime.format(-hours, "hour")
						: relativeTime.format(-Math.floor(hours / 24), "day"),
			group: age < day ? "Last 24 Hours" : age < 7 * day ? "This Past Week" : "Earlier",
		};
	});

	return {
		items,
		hasNextPage: found.meta.has_next_page,
		preparing: found.meta.preparing,
	};
});
