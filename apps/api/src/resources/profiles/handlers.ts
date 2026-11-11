import { OpenAPIHono } from "@hono/zod-openapi";
import {
	createProfile,
	deleteProfile,
	getProfile,
	listProfiles,
	updateProfile,
} from "@sora/core/auth";
import {
	getFeatured,
	getPlaybackPreferences,
	getProfilePreferences,
	updatePlaybackPreferences,
	updateProfilePreferences,
} from "@sora/core/library";

import { onInvalidRequest } from "../../errors";
import type { V1Env } from "../../errors";
import { profileRoute } from "./contract";

/** The handlers for {@link profileRoute}. */
export const profileRoutes = new OpenAPIHono<V1Env>({
	defaultHook: onInvalidRequest,
})
	.openapi(profileRoute.listProfiles, async (c) => {
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

	.openapi(profileRoute.createProfile, async (c) => {
		const profile = await createProfile(c.get("accountId"), c.req.valid("json"));
		return c.json(
			{
				meta: {},
				results: profile,
			},
			201,
		);
	})

	.openapi(profileRoute.updateProfile, async (c) => {
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

	.openapi(profileRoute.deleteProfile, async (c) => {
		await deleteProfile(c.get("accountId"), c.req.valid("param").profile_id);
		return c.body(null, 204);
	})

	.openapi(profileRoute.getFeatured, async (c) => {
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

	.openapi(profileRoute.getPlaybackPreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const preferences = await getPlaybackPreferences(profile.id);
		return c.json(
			{
				meta: {},
				results: preferences,
			},
			200,
		);
	})

	.openapi(profileRoute.updatePlaybackPreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const preferences = await updatePlaybackPreferences(profile.id, c.req.valid("json"));
		return c.json(
			{
				meta: {},
				results: preferences,
			},
			200,
		);
	})

	.openapi(profileRoute.getProfilePreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const preferences = await getProfilePreferences(profile.id);
		return c.json(
			{
				meta: {},
				results: preferences,
			},
			200,
		);
	})

	.openapi(profileRoute.updateProfilePreferences, async (c) => {
		const profile = await getProfile(c.get("accountId"), c.req.valid("param").profile_id);
		const preferences = await updateProfilePreferences(profile.id, c.req.valid("json"));
		return c.json(
			{
				meta: {},
				results: preferences,
			},
			200,
		);
	});
