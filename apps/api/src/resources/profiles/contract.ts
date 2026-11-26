import { createRoute, z } from "@hono/zod-openapi";
import { ProfileInputSchema, ProfileSchema } from "@sora/core/models/account";
import {
	PlaybackChangesSchema,
	PlaybackPreferencesSchema,
	ProfilePreferencesSchema,
	ProfileChangesSchema,
} from "@sora/core/models/library";
import { FeaturedCardSchema } from "@sora/core/models/series";

import { CountMetaSchema, envelope } from "../../openapi/envelope";
import { json, problem, EmptyMeta, signedIn, ProfileParams } from "../../openapi/schemas";

/** The account's profiles, their preferences, and their featured titles. */
export const contract = {
	createProfile: createRoute({
		description: "An account may hold any number of profiles.",
		method: "post",
		operationId: "createProfile",
		path: "/profiles",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ProfileInputSchema,
					},
				},
				required: true,
			},
		},
		responses: {
			201: json(envelope(ProfileSchema, EmptyMeta), "The new profile."),
			401: problem("Not signed in."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Add a profile",
		tags: ["Profiles"],
	}),
	deleteProfile: createRoute({
		description: "Deletes the profile and what Sora keeps for it.",
		method: "delete",
		operationId: "deleteProfile",
		path: "/profiles/{profile_id}",
		request: {
			params: ProfileParams,
		},
		responses: {
			204: {
				description: "Deleted.",
			},
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			409: problem("The profile is the account's last; an account keeps at least one."),
		},
		security: signedIn,
		summary: "Delete a profile",
		tags: ["Profiles"],
	}),
	getFeatured: createRoute({
		description:
			"Five titles to feature on the profile's home page, fewer only when fewer can be shown: well-liked seasons and films that are airing or started in the last year, airing ones and what is popular right now first, never old favourites without a new season. They are picked every day at 06:00 UTC, in an order of the profile's own that favours the genres it completed, watched and rated well, and kept all day. Seasons the profile completed are left out, as is every season of a show it dropped or rated two stars or fewer. A title featured before comes back first only with a new episode. Long-running titles are left out, as are those without a clean 4K backdrop and a logo, and those nothing streams.",
		method: "get",
		operationId: "getFeatured",
		path: "/profiles/{profile_id}/featured",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelope(z.array(FeaturedCardSchema), CountMetaSchema), "The titles."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "Titles to feature",
		tags: ["Profiles"],
	}),
	getPlaybackPreferences: createRoute({
		description:
			"The audio, subtitles, and skipping the profile last picked in a player, so every episode on every device plays the same way. The defaults until it picks anything: the first version an episode has, its default subtitles, and no auto-skip.",
		method: "get",
		operationId: "getPlaybackPreferences",
		path: "/profiles/{profile_id}/playback-preferences",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelope(PlaybackPreferencesSchema, EmptyMeta), "The preferences."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "How the profile likes episodes to play",
		tags: ["Profiles"],
	}),
	getProfilePreferences: createRoute({
		description:
			"How the profile wants Sora to look and what it wants to hear about: whether unwatched episodes hide their picture, title and summary, and which kinds of release are notifications. The defaults until it picks anything: nothing hidden and every kind on.",
		method: "get",
		operationId: "getProfilePreferences",
		path: "/profiles/{profile_id}/preferences",
		request: {
			params: ProfileParams,
		},
		responses: {
			200: json(envelope(ProfilePreferencesSchema, EmptyMeta), "The preferences."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
		},
		security: signedIn,
		summary: "The profile's display and notification preferences",
		tags: ["Profiles"],
	}),
	listProfiles: createRoute({
		description:
			"Every profile of the signed-in account, oldest first. A new account starts with one.",
		method: "get",
		operationId: "listProfiles",
		path: "/profiles",
		responses: {
			200: json(envelope(z.array(ProfileSchema), CountMetaSchema), "The profiles."),
			401: problem("Not signed in."),
		},
		security: signedIn,
		summary: "List the account's profiles",
		tags: ["Profiles"],
	}),
	updatePlaybackPreferences: createRoute({
		description:
			"Changes only what is given. Subtitles change per audio: picking the dub's leaves the sub's as they are.",
		method: "patch",
		operationId: "updatePlaybackPreferences",
		path: "/profiles/{profile_id}/playback-preferences",
		request: {
			body: {
				content: {
					"application/json": {
						schema: PlaybackChangesSchema,
					},
				},
				required: true,
			},
			params: ProfileParams,
		},
		responses: {
			200: json(
				envelope(PlaybackPreferencesSchema, EmptyMeta),
				"The preferences as they now stand.",
			),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Remember what the profile picked in a player",
		tags: ["Profiles"],
	}),
	updateProfile: createRoute({
		method: "patch",
		operationId: "updateProfile",
		path: "/profiles/{profile_id}",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ProfileInputSchema.partial(),
					},
				},
				required: true,
			},
			params: ProfileParams,
		},
		responses: {
			200: json(envelope(ProfileSchema, EmptyMeta), "The profile."),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Rename or recolor a profile",
		tags: ["Profiles"],
	}),
	updateProfilePreferences: createRoute({
		description:
			"Changes only what is given. Notification kinds change one by one: turning off dubs leaves the other kinds as they are.",
		method: "patch",
		operationId: "updateProfilePreferences",
		path: "/profiles/{profile_id}/preferences",
		request: {
			body: {
				content: {
					"application/json": {
						schema: ProfileChangesSchema,
					},
				},
				required: true,
			},
			params: ProfileParams,
		},
		responses: {
			200: json(
				envelope(ProfilePreferencesSchema, EmptyMeta),
				"The preferences as they now stand.",
			),
			401: problem("Not signed in."),
			404: problem("The account has no such profile."),
			422: problem("The body is invalid."),
		},
		security: signedIn,
		summary: "Change the profile's display and notification preferences",
		tags: ["Profiles"],
	}),
};
