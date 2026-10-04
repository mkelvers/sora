import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import type { Notification } from "@sora/sdk";
import { z } from "zod";

function detail(item: Notification) {
	const count = item.last_episode - item.first_episode + 1;
	const film = item.series.format === "MOVIE";

	if (item.kind === "dub") {
		if (film) {
			return "It is now dubbed in English. Ready whenever you are.";
		}

		if (count === 1) {
			return `Episode ${item.last_episode} is now dubbed in English.`;
		}

		return `${count} episodes are now dubbed in English, ${item.first_episode} through ${item.last_episode}.`;
	}

	if (item.kind === "premiere") {
		if (film) {
			return "It has arrived, ready whenever you are.";
		}

		if (count > 1) {
			return `It has started, and ${count} episodes are waiting for you.`;
		}

		return "It has started with its first episode.";
	}

	if (count === 1 && item.episode_title) {
		return `Episode ${item.last_episode} is out: “${item.episode_title}”. Settle in and catch up.`;
	}

	if (count === 1) {
		return `Episode ${item.last_episode} is out. Settle in and catch up.`;
	}

	return `${count} new episodes are out, ${item.first_episode} through ${item.last_episode}. Plenty to dig into.`;
}

export const getNotifications = query(async () => {
	const viewer = remoteViewer();

	const notifications = await viewer.sora.request(route.getNotifications, {
		params: {
			profile_id: viewer.profile.id,
		},
		query: {
			limit: 100,
		},
	});
	return notifications.map((item) => ({
		...item,
		detail: detail(item),
	}));
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
