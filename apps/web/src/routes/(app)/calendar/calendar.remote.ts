import { query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const getCalendar = query(
	z.object({
		timeZone: z.string().min(1).max(100),
		weeks: z.number().int().min(-520).max(520),
	}),
	({ timeZone, weeks }) =>
		remoteViewer().sora.request(route.getCalendar, {
			query: {
				time_zone: timeZone,
				week: weeks,
			},
		}),
);
