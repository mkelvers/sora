import { z } from "@hono/zod-openapi";

/**
 * A camelCase name in snake_case, as the API spells every JSON field and
 * query parameter: `hasNextPage` becomes `has_next_page`.
 */
export type SnakeCase<TName extends string> = TName extends `${infer THead}${infer TTail}`
  ? `${THead extends Lowercase<THead> ? THead : `_${Lowercase<THead>}`}${SnakeCase<TTail>}`
  : TName;

/** A core model with every field name, at every depth, in snake_case. */
export type SnakeCased<TValue> = TValue extends readonly (infer TItem)[]
  ? SnakeCased<TItem>[]
  : TValue extends object
    ? {
        [TKey in keyof TValue as TKey extends string ? SnakeCase<TKey> : TKey]: SnakeCased<TValue[TKey]>;
      }
    : TValue;

/** Spells a camelCase name in snake_case at runtime; see {@link SnakeCase}. */
export function snakeCase(name: string) {
  return name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Renames every field of a core model, at every depth, to snake_case. The
 * core's models are plain JSON: objects, arrays, strings, numbers, booleans,
 * and nulls.
 */
export function snakeCased<TValue>(value: TValue): SnakeCased<TValue> {
  if (Array.isArray(value)) {
    return value.map(snakeCased) as SnakeCased<TValue>;
  }

  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([name, field]) => [snakeCase(name), snakeCased(field)])
    ) as SnakeCased<TValue>;
  }

  return value as SnakeCased<TValue>;
}

/**
 * The body of every successful JSON response: what was asked for under
 * `results`, and facts about the response, such as paging, under `meta`.
 * `results` is an object for one resource and an array for a list.
 */
export function envelopeOf<TResults extends z.ZodType, TMeta extends z.ZodType>(results: TResults, meta: TMeta) {
  return z.object({
    results,
    meta
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
      example: "/v1/search?q=frieren&page=2"
    }),
    previous: z.string().nullable().openapi({
      description: "The previous page's URL, with the same query, or null on the first page."
    }),
    preparing: z.boolean().openapi({
      description:
        "Whether matching titles were left out because Sora is still preparing them. Ask again in a few seconds to include them."
    })
  })
  .openapi("PageMeta");

/** The size of a list that is always returned whole. */
export const CountMetaSchema = z
  .object({
    count: z.number().int().nonnegative()
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
  }
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
    preparing: page.isPreparing
  };
}
