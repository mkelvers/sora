import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { z } from "zod";

export const getContinueWatching = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.continueWatching(viewer.profile.id);
});

export const dismiss = command(z.string(), async (seriesId) => {
	const viewer = remoteViewer();

	await viewer.sora.dismissContinueWatching(viewer.profile.id, seriesId);
	await getContinueWatching().refresh();
});

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

export const markNotificationsSeen = command(z.string(), async (seenAt) => {
	const viewer = remoteViewer();

	await viewer.sora.markNotificationsSeen(viewer.profile.id, seenAt);
	await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
});

export const markNotificationRead = command(z.string(), async (id) => {
	const viewer = remoteViewer();

	await viewer.sora.markNotificationRead(viewer.profile.id, id);
	await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
});

export const dismissNotification = command(z.string(), async (id) => {
	const viewer = remoteViewer();

	await viewer.sora.dismissNotification(viewer.profile.id, id);
	await Promise.all([getNotifications().refresh(), getUnreadNotifications().refresh()]);
});
