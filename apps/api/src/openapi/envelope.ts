import { z } from "@hono/zod-openapi";
import { PreparingTitleSchema, type PreparingTitle } from "@sora/core/contract";

/**
 * The body of every successful JSON response: facts about the response, such
 * as paging, under `meta`, and what was asked for under `results`.
 * `results` is an object for one resource and an array for a list.
 */
export function envelopeOf<TResults extends z.ZodType, TMeta extends z.ZodType>(
	results: TResults,
	meta: TMeta,
) {
	return z.object({
		meta,
		results,
	});
}

/** Paging for a list that has more than one page. */
export const PageMetaSchema = z
	.object({
		page: z.number().int().positive(),
		per_page: z.number().int().positive(),
		has_next_page: z.boolean(),
		next: z.string().nullable().openapi({
			description: "The next page's URL, with the same query, or null on the last page.",
			example: "/v1/search?q=frieren&page=2",
		}),
		previous: z.string().nullable().openapi({
			description: "The previous page's URL, with the same query, or null on the first page.",
		}),
		preparing: z.boolean().openapi({
			description:
				"Whether matching titles were left out because Sora is still preparing them. Ask again in a few seconds to include them.",
		}),
		preparing_titles: z.array(PreparingTitleSchema).openapi({
			description:
				"The titles on this page left out while they are prepared, with what is already known of them, so they can be shown at once. Each becomes a card in `results` once prepared; they have no series page until then.",
		}),
	})
	.openapi("PageMeta");

/** Paging for the items of one parent, which a client reads from any `offset`. */
export const OffsetMetaSchema = z
	.object({
		offset: z.number().int().nonnegative(),
		limit: z.number().int().positive(),
		total: z.number().int().nonnegative().openapi({
			description: "How many items the list has in all.",
		}),
		next: z.string().nullable().openapi({
			description: "The URL of the items after these, with the same query, or null after the last.",
		}),
		previous: z.string().nullable().openapi({
			description: "The URL of the items before these, with the same query, or null at the first.",
		}),
	})
	.openapi("OffsetMeta");

/** The links to the `limit` items either side of the ones from `offset`, keeping the rest of the query. */
export function offsetLinks(
	url: string,
	page: {
		offset: number;
		limit: number;
		total: number;
	},
) {
	const link = (offset: number) => {
		const target = new URL(url);
		target.searchParams.set("offset", String(offset));
		return `${target.pathname}${target.search}`;
	};

	return {
		next: page.offset + page.limit < page.total ? link(page.offset + page.limit) : null,
		previous: page.offset > 0 ? link(Math.max(page.offset - page.limit, 0)) : null,
	};
}

/** The size of a list that is always returned whole. */
export const CountMetaSchema = z
	.object({
		count: z.number().int().nonnegative(),
	})
	.openapi("CountMeta");

/**
 * The meta of a page: its paging, and links to the pages next to it that
 * keep the rest of the request's query.
 */
export function pageMeta(
	url: string,
	page: {
		page: number;
		perPage: number;
		hasNextPage: boolean;
		isPreparing: boolean;
		preparing?: PreparingTitle[];
	},
): z.infer<typeof PageMetaSchema> {
	const pageUrl = (number: number) => {
		const target = new URL(url);
		target.searchParams.set("page", String(number));
		return `${target.pathname}${target.search}`;
	};

	return {
		page: page.page,
		per_page: page.perPage,
		has_next_page: page.hasNextPage,
		next: page.hasNextPage ? pageUrl(page.page + 1) : null,
		previous: page.page > 1 ? pageUrl(page.page - 1) : null,
		preparing: page.isPreparing,
		preparing_titles: page.preparing ?? [],
	};
}
