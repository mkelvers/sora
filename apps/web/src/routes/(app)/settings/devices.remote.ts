import { command, getRequestEvent, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getDevices = query(async () => {
	const { sora } = remoteViewer();

	return await sora.request(route.listDevices, undefined, {
		headers: {
			"X-Sora-User-Agent": getRequestEvent().request.headers.get("user-agent") ?? "",
		},
	});
});

export const signOutDevice = command(z.string(), async (deviceId) => {
	const { sora } = remoteViewer();

	await sora.request(route.signOutDevice, {
		params: {
			device_id: deviceId,
		},
	});
	await getDevices().refresh();
});

export const signOutOtherDevices = command(async () => {
	const { sora } = remoteViewer();

	await sora.request(route.signOutOtherDevices);
	await getDevices().refresh();
});
