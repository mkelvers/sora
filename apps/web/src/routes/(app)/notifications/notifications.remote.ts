import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getLatest = query(async () => {
	const { sora, profile } = remoteViewer();

	const { results, meta } = await sora.requestWithMeta(route.getNotifications, {
		params: {
			profile_id: profile.id,
		},
		query: {
			limit: 100,
		},
	});

	return {
		items: results,
		unread: meta.unread,
	};
});

export const getUnread = query(async () => {
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

export const markRead = command(z.array(z.string()).min(1).max(100), async (ids) => {
	const { sora, profile } = remoteViewer();

	await sora.request(route.markNotificationsRead, {
		body: {
			ids,
		},
		params: {
			profile_id: profile.id,
		},
	});
	await Promise.all([getLatest().refresh(), getUnread().refresh()]);
});

export const dismiss = command(z.string(), async (id) => {
	const { sora, profile } = remoteViewer();

	await sora.request(route.dismissNotification, {
		params: {
			notification_id: id,
			profile_id: profile.id,
		},
	});
	await Promise.all([getLatest().refresh(), getUnread().refresh()]);
});
