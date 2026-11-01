import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getContinueWatching } from "$routes/(app)/(home)/home.remote";
import { getUnreadNotifications } from "$routes/(app)/notifications/notifications.remote";
import { getWatchlist, getWatchlistStatuses } from "$routes/(app)/watchlist/watchlist.remote";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getImportConnections = query(async () => {
	const { sora, profile } = remoteViewer();

	return await sora.request(route.listImportConnections, {
		params: {
			profile_id: profile.id,
		},
	});
});

export const importLibrary = command(
	route.importLibrary.request.body.content["application/json"].schema,
	async (input) => {
		const { sora, profile } = remoteViewer();

		const report = await sora.request(route.importLibrary, {
			body: input,
			params: {
				profile_id: profile.id,
			},
		});
		await Promise.all([
			getWatchlist().refresh(),
			getWatchlistStatuses().refresh(),
			getContinueWatching().refresh(),
			getUnreadNotifications().refresh(),
			getImportConnections().refresh(),
		]);

		return report;
	},
);

export const disconnectImport = command(
	route.disconnectImport.request.params.shape.source,
	async (source) => {
		const { sora, profile } = remoteViewer();

		await sora.request(route.disconnectImport, {
			params: {
				profile_id: profile.id,
				source,
			},
		});
		await getImportConnections().refresh();
	},
);

export const undoImport = command(z.string(), async (importId) => {
	const { sora, profile } = remoteViewer();

	const undone = await sora.request(route.undoImport, {
		params: {
			import_id: importId,
			profile_id: profile.id,
		},
	});
	await Promise.all([
		getWatchlist().refresh(),
		getWatchlistStatuses().refresh(),
		getContinueWatching().refresh(),
		getUnreadNotifications().refresh(),
	]);

	return undone;
});

export const getImportOptions = query(
	async () => await remoteViewer().sora.request(route.getImportOptions),
);

export const authorizeImport = command(
	route.authorizeImport.request.body.content["application/json"].schema,
	async (input) => await remoteViewer().sora.request(route.authorizeImport, { body: input }),
);
