import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getNotifications = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.request(route.getNotifications, {
		params: {
			profile_id: viewer.profile.id,
		},
		query: {
			limit: 100,
		},
	});
});

export const getUnreadNotifications = query(async () => {
	const viewer = remoteViewer();

	const { meta } = await viewer.sora.requestWithMeta(route.getNotifications, {
		params: {
			profile_id: viewer.profile.id,
		},
		query: {
			limit: 1,
		},
	});
	return meta.unread;
});

export const markNotificationsRead = command(z.array(z.string()).min(1).max(100), async (ids) => {
	const viewer = remoteViewer();

	await viewer.sora.request(route.markNotificationsRead, {
		params: {
			profile_id: viewer.profile.id,
		},
		body: {
			ids,
		},
	});
	await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
});

export const dismissNotification = command(z.string(), async (id) => {
	const viewer = remoteViewer();

	await viewer.sora.request(route.dismissNotification, {
		params: {
			profile_id: viewer.profile.id,
			notification_id: id,
		},
	});
	await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
});
