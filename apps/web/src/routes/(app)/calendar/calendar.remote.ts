import { query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { z } from "zod";

export const getCalendar = query(
	z.object({
		timeZone: z.string().min(1).max(100),
		weeks: z.number().int().min(-520).max(520),
	}),
	({ timeZone, weeks }) => {
		const { data: zone } = attempt(() => Temporal.Now.zonedDateTimeISO(timeZone), RangeError);

		return remoteViewer().sora.request(route.getCalendar, {
			query: {
				time_zone: zone?.timeZoneId ?? "UTC",
				week: weeks,
			},
		});
	},
);
