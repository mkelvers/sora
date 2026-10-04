import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { z } from "zod";

export const getNotifications = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.notifications(viewer.profile.id, {
		params: {
			limit: 100,
		},
	});
});

export const getUnreadNotifications = query(async () => {
	const viewer = remoteViewer();

	const { meta } = await viewer.sora.notifications(viewer.profile.id, {
		params: {
			limit: 1,
		},
		meta: true,
	});
	return meta.unread;
});

export const markNotificationsRead = command(z.array(z.string()).min(1).max(100), async (ids) => {
	const viewer = remoteViewer();

	await viewer.sora.markNotificationsRead(viewer.profile.id, ids);
	await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
});

export const dismissNotification = command(z.string(), async (id) => {
	const viewer = remoteViewer();

	await viewer.sora.dismissNotification(viewer.profile.id, id);
	await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
});
