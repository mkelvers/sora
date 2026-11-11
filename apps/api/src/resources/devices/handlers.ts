import { OpenAPIHono } from "@hono/zod-openapi";
import { listDevices, signOutDevice, signOutOtherDevices } from "@sora/core/auth";
import { isWebClientKey } from "@sora/core/playback";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { deviceRoute } from "./contract";

/** The handlers for {@link deviceRoute}. */
export const deviceRoutes = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(deviceRoute.listDevices, async (c) => {
		// Only the web app, which proves itself with its key, may say what browser a person is on.
		const fromWebApp = isWebClientKey(c.req.header("X-Sora-Client-Key"));
		const devices = await listDevices(
			c.get("accountId"),
			c.get("sessionId"),
			fromWebApp ? (c.req.header("X-Sora-User-Agent") ?? null) : null,
		);
		return c.json(
			{
				meta: {
					count: devices.length,
				},
				results: devices,
			},
			200,
		);
	})

	.openapi(deviceRoute.signOutDevice, async (c) => {
		await signOutDevice(c.get("accountId"), c.req.valid("param").device_id);
		return c.body(null, 204);
	})

	.openapi(deviceRoute.signOutOtherDevices, async (c) => {
		await signOutOtherDevices(c.get("accountId"), c.get("sessionId"));
		return c.body(null, 204);
	});
