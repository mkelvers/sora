import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getNotifications = query(async () => {
	const { sora, profile } = remoteViewer();

	return sora.request(route.getNotifications, {
		params: {
			profile_id: profile.id,
		},
		query: {
			limit: 100,
		},
	});
});

export const getUnreadNotifications = query(async () => {
	const { sora, profile } = remoteViewer();

	const { meta } = await sora.requestWithMeta(route.getNotifications, {
		params: {
			profile_id: profile.id,
		},
		query: {
			limit: 1,
		},
	});
	return meta.unread;
});

export const markNotificationsRead = command(z.array(z.string()).min(1).max(100), async (ids) => {
	const { sora, profile } = remoteViewer();

	await sora.request(route.markNotificationsRead, {
		params: {
			profile_id: profile.id,
		},
		body: {
			ids,
		},
	});
	await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
});

export const dismissNotification = command(z.string(), async (id) => {
	const { sora, profile } = remoteViewer();

	await sora.request(route.dismissNotification, {
		params: {
			profile_id: profile.id,
			notification_id: id,
		},
	});
	await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
});
