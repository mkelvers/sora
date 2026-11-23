import { OpenAPIHono } from "@hono/zod-openapi";
import { devices } from "@sora/core/auth";
import { isWebKey } from "@sora/core/playback";

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

		if (isWebKey(c.req.header("X-Sora-Client-Key"))) {
			userAgent = c.req.header("X-Sora-User-Agent") ?? null;
		}

		const results = await devices.list(c.get("accountId"), c.get("sessionId"), userAgent);

		return c.json(
			{
				meta: {
					count: results.length,
				},
				results,
			},
			200,
		);
	})

	.openapi(contract.signOutDevice, async (c) => {
		await devices.signOut(c.get("accountId"), c.req.valid("param").device_id);

		return c.body(null, 204);
	})

	.openapi(contract.signOutOtherDevices, async (c) => {
		await devices.signOutOthers(c.get("accountId"), c.get("sessionId"));

		return c.body(null, 204);
	});
