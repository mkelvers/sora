import { command, getRequestEvent, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getSignIns = query(async () => {
	const { sora } = remoteViewer();

	return await sora.request(route.listDevices, undefined, {
		headers: {
			"X-Sora-User-Agent": getRequestEvent().request.headers.get("user-agent") ?? "",
		},
	});
});

export const revoke = command(z.string(), async (id) => {
	const { sora } = remoteViewer();

	await sora.request(route.signOutDevice, {
		params: {
			device_id: id,
		},
	});
	await getSignIns().refresh();
});

export const revokeOthers = command(async () => {
	const { sora } = remoteViewer();

	await sora.request(route.signOutOtherDevices);
	await getSignIns().refresh();
});
