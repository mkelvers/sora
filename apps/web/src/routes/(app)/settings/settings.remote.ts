import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import {
	getNotifications,
	getUnreadNotifications,
} from "$routes/(app)/notifications/notifications.remote";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getProfilePreferences = query(async () => {
	const { sora, profile } = remoteViewer();

	return await sora.request(route.getProfilePreferences, {
		params: {
			profile_id: profile.id,
		},
	});
});

export const saveProfilePreferences = command(
	z.object({
		hide_spoilers: z.boolean().optional(),
		notifications: z
			.object({
				dubs: z.boolean().optional(),
				episodes: z.boolean().optional(),
				premieres: z.boolean().optional(),
			})
			.optional(),
	}),
	async (changes) => {
		const { sora, profile } = remoteViewer();

		getProfilePreferences().set(
			await sora.request(route.updateProfilePreferences, {
				body: changes,
				params: {
					profile_id: profile.id,
				},
			}),
		);
		await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
	},
);
