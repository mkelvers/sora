import { OpenAPIHono } from "@hono/zod-openapi";
import { getProfile } from "@sora/core/auth";
import {
	authorizationUrl,
	exportLibrary,
	disconnectImport,
	importLibrary,
	importOptions,
	listImportConnections,
	undoImport,
} from "@sora/core/library";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { transferRoute } from "./contract";

/** The handlers for {@link transferRoute}. */
export const transferRoutes = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(transferRoute.getImportOptions, (c) =>
		c.json(
			{
				meta: {},
				results: importOptions(),
			},
			200,
		),
	)

	.openapi(transferRoute.authorizeImport, (c) => {
		const { source, redirect_uri, state, code_challenge } = c.req.valid("json");
		return c.json(
			{
				meta: {},
				results: {
					url: authorizationUrl(source, {
						codeChallenge: code_challenge,
						redirectUri: redirect_uri,
						state,
					}),
				},
			},
			200,
		);
	})

	.openapi(transferRoute.exportLibrary, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const library = await exportLibrary(profile.id);
		return c.json(
			{
				meta: {},
				results: library,
			},
			200,
		);
	})

	.openapi(transferRoute.importLibrary, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const report = await importLibrary(profile.id, c.req.valid("json"));
		return c.json(
			{
				meta: {},
				results: report,
			},
			200,
		);
	})

	.openapi(transferRoute.listImportConnections, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const connections = await listImportConnections(profile.id);
		return c.json(
			{
				meta: {
					count: connections.length,
				},
				results: connections,
			},
			200,
		);
	})

	.openapi(transferRoute.disconnectImport, async (c) => {
		const { profile_id, source } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		await disconnectImport(profile.id, source);
		return c.body(null, 204);
	})

	.openapi(transferRoute.undoImport, async (c) => {
		const { profile_id, import_id } = c.req.valid("param");
		const profile = await getProfile(c.get("accountId"), profile_id);
		return c.json(
			{
				meta: {},
				results: await undoImport(profile.id, import_id),
			},
			200,
		);
	});
