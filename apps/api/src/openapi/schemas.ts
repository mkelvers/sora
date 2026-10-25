/**
 * The pieces of the OpenAPI document that belong to the API rather than to a
 * model: the problem body, path parameters, request bodies, and the meta of
 * a response. The models themselves are the core's (`@sora/core/models`).
 */
import { z } from "@hono/zod-openapi";

/**
 * An RFC 9457 problem details body, which every error response carries as
 * `application/problem+json`.
 */
export const ProblemSchema = z
	.object({
		code: z.string().openapi({
			description:
				"A stable, machine-readable failure code to branch on; `detail` may change. New codes may be added, so clients must handle codes they do not know.",
			example: "SERIES_NOT_FOUND",
		}),
		detail: z.string().optional().openapi({
			example: "Series GYZJ43JMR does not exist",
		}),
		/** Every invalid field, for `INVALID_INPUT` problems. */
		errors: z
			.array(
				z.object({
					message: z.string(),
					path: z.string(),
				}),
			)
			.optional(),
		instance: z.string().optional().openapi({
			example: "/v1/series/GYZJ43JMR",
		}),
		status: z.number().int().openapi({
			example: 404,
		}),
		title: z.string().openapi({
			example: "Not Found",
		}),
		type: z.string().openapi({
			example: "about:blank",
		}),
	})
	.openapi("Problem");

/** The body of every error response. */
export type Problem = z.infer<typeof ProblemSchema>;

/** A problem response for the given status, for route definitions. */
export const problem = (description: string) => ({
	content: {
		"application/problem+json": {
			schema: ProblemSchema,
		},
	},
	description,
});

/** A JSON response for the given schema, for route definitions. */
export const json = <TSchema extends z.ZodType>(schema: TSchema, description: string) => ({
	content: {
		"application/json": {
			schema,
		},
	},
	description,
});

export const SeriesIdParam = z.string().openapi({
	description: "Sora series ID.",
	example: "GYZJ43JMR",
	param: {
		in: "path",
		name: "series_id",
	},
});

export const ProfileIdParam = z.string().openapi({
	description: "Sora profile ID, of a profile of the signed-in account.",
	example: "7HTQ2LMXB",
	param: {
		in: "path",
		name: "profile_id",
	},
});

export const EpisodeNumberParam = z.coerce
	.number()
	.int()
	.positive()
	.openapi({
		description: "The episode's number in the series, from 1.",
		example: 1,
		param: {
			in: "path",
			name: "episode",
		},
	});

/** The episode a playback is for, when its stream URLs expire, and the episodes either side of it. */
export const PlaybackMetaSchema = z
	.object({
		episode: z.number().int(),
		expires_at: z.string().openapi({
			description:
				"When the stream URLs stop working, as an ISO 8601 timestamp. Resolve again after it.",
			example: "2026-09-25T18:00:00.000Z",
		}),
		next: z.string().nullable().openapi({
			description:
				"The next episode's playback URL, or null after the last one the title lists: playing never runs on into another title, such as the next season.",
			example: "/v1/series/GYZJ43JMR/episodes/2/playback",
		}),
		next_episode: z.number().int().nullable().openapi({
			description: "The number of the episode `next` plays.",
		}),
		previous: z.string().nullable().openapi({
			description: "The previous episode's playback URL, or null before the first one.",
		}),
		previous_episode: z.number().int().nullable().openapi({
			description: "The number of the episode `previous` plays.",
		}),
		series_id: z.string(),
	})
	.openapi("PlaybackMeta");

export const NotificationsMetaSchema = z
	.object({
		count: z.number().int().nonnegative(),
		unread: z.number().int().nonnegative().openapi({
			description:
				"How many of the profile's notifications are unread, including those past `limit`.",
		}),
	})
	.openapi("NotificationsMeta");

export const NotificationsReadSchema = z
	.object({
		ids: z
			.array(z.string().min(1))
			.min(1)
			.max(100)
			.openapi({
				description:
					"The `id` of each notification to mark read: the ones the profile was shown, so one that came out meanwhile stays unread.",
				example: ["EWBMBNIV4:13"],
			}),
	})
	.openapi("NotificationsRead");
