import { createRoute, z } from "@hono/zod-openapi";
import { NotificationSchema } from "@sora/core/models/library";

import { envelopeOf } from "../../openapi/envelope";
import {
	json,
	NotificationsMetaSchema,
	NotificationsReadSchema,
	problem,
	signedIn,
	ProfileParams,
} from "../../openapi/schemas";

/** A profile's notifications. */
export const notificationRoute = {
	dismissNotification: createRoute({
		description: "Takes the notification out of the profile's notifications for good.",
		method: "delete",
		operationId: "dismissNotification",
		path: "/profiles/{profile_id}/notifications/{notification_id}",
		request: {
			params: ProfileParams.extend({
				notification_id: z
					.string()
					.min(1)
					.openapi({
						description: "The notification's `id`.",
						example: "EWBMBNIV4:13",
						param: {
							in: "path",
							name: "notification_id",
						},
					}),
			}),
		},
		responses: {
			204: {
				description: "Deleted, or was not listed.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Delete a notification",
		tags: ["Profiles"],
	}),
	getNotifications: createRoute({
		description:
			"What came out in the last 30 days for titles the profile saved or played and their connected sequels and prequels, newest first: announced sequels and prequels, premieres, new episodes, and English dubs of episodes that were out already. Connected seasons do not need to be on the watchlist. An announcement counts from when Sora first stored the announced title and goes once it starts. Episodes of one title that come out together make one notification. Only releases after the earliest watchlist or recorded playback time in the connected seasons qualify. Dropped titles do not start following or receive notifications, even with playback progress. A regular release notification goes once the profile plays one of its episodes, or deletes it; a dub stays after playback.",
		method: "get",
		operationId: "getNotifications",
		path: "/profiles/{profile_id}/notifications",
		request: {
			params: ProfileParams,
			query: z.object({
				limit: z.coerce.number().int().min(1).max(100).optional().openapi({
					description: "At most this many notifications; 30 when omitted.",
				}),
			}),
		},
		responses: {
			200: json(
				envelopeOf(z.array(NotificationSchema), NotificationsMetaSchema),
				"The notifications.",
			),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "What came out for the shows the profile follows",
		tags: ["Profiles"],
	}),
	markNotificationsRead: createRoute({
		description:
			"Marks the given notifications read. One that is not listed, or already read, is left as it is.",
		method: "put",
		operationId: "markNotificationsRead",
		path: "/profiles/{profile_id}/notifications/read",
		request: {
			body: {
				content: {
					"application/json": {
						schema: NotificationsReadSchema,
					},
				},
				required: true,
			},
			params: ProfileParams,
		},
		responses: {
			204: {
				description: "Marked.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Mark notifications read",
		tags: ["Profiles"],
	}),
};
