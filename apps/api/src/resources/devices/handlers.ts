import { OpenAPIHono } from "@hono/zod-openapi";
import { listDevices, signOutDevice, signOutOtherDevices } from "@sora/core/auth";
import { isWebClientKey } from "@sora/core/playback";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { contract } from "./contract";

/** The handlers for {@link contract}. */
export const handlers = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(contract.listDevices, async (c) => {
		// Only the web app, which proves itself with its key, may say what browser a person is on.
		let userAgent: string | null = null;

		if (isWebClientKey(c.req.header("X-Sora-Client-Key"))) {
			userAgent = c.req.header("X-Sora-User-Agent") ?? null;
		}

		const devices = await listDevices(c.get("accountId"), c.get("sessionId"), userAgent);

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

	.openapi(contract.signOutDevice, async (c) => {
		await signOutDevice(c.get("accountId"), c.req.valid("param").device_id);

		return c.body(null, 204);
	})

	.openapi(contract.signOutOtherDevices, async (c) => {
		await signOutOtherDevices(c.get("accountId"), c.get("sessionId"));

		return c.body(null, 204);
	});
