import { OpenAPIHono } from "@hono/zod-openapi";
import { getProfile } from "@sora/core/auth";
import { dismissNotification, getNotifications, markNotificationsRead } from "@sora/core/library";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { notificationRoute } from "./contract";

/** The handlers for {@link notificationRoute}. */
export const notificationRoutes = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(notificationRoute.getNotifications, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const notifications = await getNotifications(profile.id, {
			limit: c.req.valid("query").limit,
		});
		return c.json(
			{
				meta: {
					count: notifications.items.length,
					unread: notifications.unread,
				},
				results: notifications.items,
			},
			200,
		);
	})

	.openapi(notificationRoute.markNotificationsRead, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		await markNotificationsRead(profile.id, c.req.valid("json").ids);
		return c.body(null, 204);
	})

	.openapi(notificationRoute.dismissNotification, async (c) => {
		const { profile_id, notification_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await dismissNotification(profile.id, notification_id);
		return c.body(null, 204);
	});
