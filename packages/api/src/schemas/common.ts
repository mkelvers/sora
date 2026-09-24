import { z } from "@hono/zod-openapi";

/**
 * An RFC 9457 problem details body, which every error response carries as
 * `application/problem+json`.
 */
export const ProblemSchema = z
  .object({
    type: z.string().openapi({
      example: "about:blank"
    }),
    title: z.string().openapi({
      example: "Not Found"
    }),
    status: z.number().int().openapi({
      example: 404
    }),
    detail: z.string().optional().openapi({
      example: "Series a_4kQ9vB2xLm0T does not exist"
    }),
    instance: z.string().optional().openapi({
      example: "/anime/a_4kQ9vB2xLm0T"
    }),
    /** A stable, machine-readable failure code; messages may change, codes do not. */
    code: z.string().openapi({
      example: "SERIES_NOT_FOUND"
    }),
    /** Every invalid field, for `INVALID_INPUT` problems. */
    errors: z
      .array(
        z.object({
          path: z.string(),
          message: z.string()
        })
      )
      .optional()
  })
  .openapi("Problem");

/** Wraps a list so it can grow fields, such as paging, without breaking clients. */
export function itemsOf<TItem extends z.ZodType>(item: TItem) {
  return z.object({
    items: z.array(item)
  });
}

/** A problem response for the given status, for route definitions. */
export function problem(description: string) {
  return {
    description,
    content: {
      "application/problem+json": {
        schema: ProblemSchema
      }
    }
  };
}

/** The response every rate-limited route may give. */
export const tooManyRequests = problem("Too many requests; retry after `Retry-After` seconds.");

/** A JSON response for the given schema, for route definitions. */
export function json<TSchema extends z.ZodType>(schema: TSchema, description: string) {
  return {
    description,
    content: {
      "application/json": {
        schema
      }
    }
  };
}

export const SeriesIdParam = z.string().openapi({
  param: {
    name: "animeId",
    in: "path"
  },
  description: "Sora series ID.",
  example: "a_CZMtco3dTTAN"
});

export const SeasonIdParam = z.string().openapi({
  param: {
    name: "seasonId",
    in: "path"
  },
  description: "Sora season ID.",
  example: "s_WGQtg1RoFmfJ"
});

export const EpisodeNumberParam = z.coerce
  .number()
  .int()
  .positive()
  .openapi({
    param: {
      name: "episode",
      in: "path"
    },
    description: "Position within the season, from 1.",
    example: 1
  });

/** The security requirement of routes that need a signed-in user: a bearer token or the session cookie. */
export const signedIn: Record<string, string[]>[] = [
  {
    bearerAuth: []
  },
  {
    cookieAuth: []
  }
];
