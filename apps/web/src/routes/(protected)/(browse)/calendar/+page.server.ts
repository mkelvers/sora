import { sora } from "$lib/server/sora";
import { timeZoneCookie } from "$lib/utils";
import { error, redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

function zoneOf(value: string | undefined) {
	try {
		return value ? Temporal.Now.zonedDateTimeISO(value).timeZoneId : "UTC";
	} catch {
		return "UTC";
	}
}

function mondayOf(date: Temporal.PlainDate) {
	return date.subtract({
		days: date.dayOfWeek - 1,
	});
}

export const load: PageServerLoad = async ({ cookies, depends, url }) => {
	depends("sora:time-zone");

	const timeZone = zoneOf(cookies.get(timeZoneCookie));
	const today = Temporal.Now.plainDateISO(timeZone);
	const current = mondayOf(today);

	const href = (date: Temporal.PlainDate) =>
		date.equals(current) ? "/calendar" : `/calendar?week=${date}`;

	let monday = current;
	const week = url.searchParams.get("week");
	if (week !== null) {
		try {
			monday = mondayOf(Temporal.PlainDate.from(week));
		} catch {
			error(404, "That week is not available");
		}
		if (monday.year < 2000 || monday.year > 2100) {
			error(404, "That week is not available");
		}
		if (monday.equals(current) || monday.toString() !== week) {
			redirect(307, href(monday));
		}
	}

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
		timeZone,
		now: Date.now(),
		ahead:
			Temporal.PlainDate.compare(
				monday,
				current.add({
					days: 7,
				}),
			) > 0,
		days,
		previous: href(
			monday.subtract({
				days: 7,
			}),
		),
		next: href(
			monday.add({
				days: 7,
			}),
		),
	};
};
