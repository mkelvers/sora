import { query } from "$app/server";
import { sora } from "$lib/server/sora";
import { attempt } from "@sora/attempt";
import { error } from "@sveltejs/kit";
import { z } from "zod";

function mondayOf(date: Temporal.PlainDate) {
	return date.subtract({
		days: date.dayOfWeek - 1,
	});
}

export const getCalendar = query(
	z.object({
		timeZone: z.string().min(1).max(100),
		weeks: z.number().int().min(-520).max(520),
	}),
	async ({ timeZone, weeks }) => {
		const { data: today, error: invalid } = attempt(
			() => Temporal.Now.plainDateISO(timeZone),
			RangeError,
		);
		if (invalid) {
			error(400, "That time zone is not available");
		}

		const current = mondayOf(today);
		const monday = current.add({
			weeks,
		});

		const from = monday.toZonedDateTime(timeZone);
		const until = monday
			.add({
				days: 7,
			})
			.toZonedDateTime(timeZone);
		const episodes = await sora.schedule({
			params: {
				from: new Date(from.epochMilliseconds),
				until: new Date(until.epochMilliseconds),
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
					today: date.equals(today),
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
