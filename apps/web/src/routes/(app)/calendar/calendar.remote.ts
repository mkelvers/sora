import { query } from "$app/server";
import { sora } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error } from "@sveltejs/kit";
import { z } from "zod";

export const getCalendar = query(
	z.object({
		timeZone: z.string().min(1).max(100),
		weeks: z.number().int().min(-520).max(520),
	}),
	async ({ timeZone, weeks }) => {
		const today = attempt(() => Temporal.Now.plainDateISO(timeZone), RangeError);
		if (today.error) {
			error(400, "That time zone is not available");
		}

		const current = today.data.subtract({
			days: today.data.dayOfWeek - 1,
		});
		const monday = current.add({
			weeks,
		});

		const from = monday.toZonedDateTime(timeZone);
		const until = monday
			.add({
				days: 7,
			})
			.toZonedDateTime(timeZone);
		const episodes = await sora.request(route.getSchedule, {
			query: {
				from: new Date(from.epochMilliseconds).toISOString(),
				until: new Date(until.epochMilliseconds).toISOString(),
			},
		});

		const days = Array.from(
			{
				length: 7,
			},
			(_, index) => {
				const date = monday.add({
					days: index,
				});
				return {
					date: date.toString(),
					today: date.equals(today.data),
					episodes: episodes.filter((episode) =>
						Temporal.Instant.from(episode.airing_at)
							.toZonedDateTimeISO(timeZone)
							.toPlainDate()
							.equals(date),
					),
				};
			},
		);

		return {
			now: Date.now(),
			ahead: weeks > 1,
			days,
		};
	},
);
