import { OpenAPIHono } from "@hono/zod-openapi";
import {
	createProfile,
	deleteProfile,
	getProfile,
	listProfiles,
	updateProfile,
} from "@sora/core/auth";
import { getFeatured, preferences } from "@sora/core/library";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { contract } from "./contract";

/** The handlers for {@link contract}. */
export const handlers = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(contract.listProfiles, async (c) => {
		const profiles = await listProfiles(c.get("accountId"));

		return c.json(
			{
				meta: {
					count: profiles.length,
				},
				results: profiles,
			},
			200,
		);
	})

	.openapi(contract.createProfile, async (c) => {
		const profile = await createProfile(c.get("accountId"), c.req.valid("json"));

		return c.json(
			{
				meta: {},
				results: profile,
			},
			201,
		);
	})

	.openapi(contract.updateProfile, async (c) => {
		const profile = await updateProfile(
			c.get("accountId"),
			c.req.valid("param").profile_id,
			c.req.valid("json"),
		);

		return c.json(
			{
				meta: {},
				results: profile,
			},
			200,
		);
	})

	.openapi(contract.deleteProfile, async (c) => {
		await deleteProfile(c.get("accountId"), c.req.valid("param").profile_id);

		return c.body(null, 204);
	})

	.openapi(contract.getFeatured, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const titles = await getFeatured(profile.id);

		return c.json(
			{
				meta: {
					count: titles.length,
				},
				results: titles,
			},
			200,
		);
	})

	.openapi(contract.getPlaybackPreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const results = await preferences.playback(profile.id);

		return c.json(
			{
				meta: {},
				results,
			},
			200,
		);
	})

	.openapi(contract.updatePlaybackPreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const results = await preferences.updatePlayback(profile.id, c.req.valid("json"));

		return c.json(
			{
				meta: {},
				results,
			},
			200,
		);
	})

	.openapi(contract.getProfilePreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const results = await preferences.profile(profile.id);

		return c.json(
			{
				meta: {},
				results,
			},
			200,
		);
	})

	.openapi(contract.updateProfilePreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const results = await preferences.updateProfile(profile.id, c.req.valid("json"));

		return c.json(
			{
				meta: {},
				results,
			},
			200,
		);
	});
