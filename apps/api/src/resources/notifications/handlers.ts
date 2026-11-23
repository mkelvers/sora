import { OpenAPIHono } from "@hono/zod-openapi";
import { getProfile } from "@sora/core/auth";
import { notifications } from "@sora/core/library";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { contract } from "./contract";

/** The handlers for {@link contract}. */
export const handlers = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(contract.getNotifications, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);

		const listed = await notifications.list(profile.id, {
			limit: c.req.valid("query").limit,
		});

		return c.json(
			{
				meta: {
					count: listed.items.length,
					unread: listed.unread,
				},
				results: listed.items,
			},
			200,
		);
	})

	.openapi(contract.markNotificationsRead, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		await notifications.markRead(profile.id, c.req.valid("json").ids);

		return c.body(null, 204);
	})

	.openapi(contract.dismissNotification, async (c) => {
		const { profile_id, notification_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await notifications.dismiss(profile.id, notification_id);

		return c.body(null, 204);
	});
