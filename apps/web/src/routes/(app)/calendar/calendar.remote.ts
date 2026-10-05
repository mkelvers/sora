import { query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { audioLabel } from "$lib/utils";
import { route } from "@sora/sdk";
import type { ScheduledEpisode } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error } from "@sveltejs/kit";
import { z } from "zod";

function releases(versions: ScheduledEpisode[]) {
	const rows: {
		types: ("sub" | "dub")[];
		count: number;
		numbers: string;
	}[] = [];

	for (const airType of ["sub", "dub"] as const) {
		const numbered = versions
			.filter((version) => version.air_type === airType)
			.toSorted((left, right) => left.episode - right.episode);
		const runs: {
			first: number;
			last: number;
		}[] = [];

		for (const version of numbered) {
			const run = runs.at(-1);
			if (run?.last === version.episode - 1) {
				run.last = version.episode;
			} else {
				runs.push({
					first: version.episode,
					last: version.episode,
				});
			}
		}

		if (!runs.length) {
			continue;
		}

		const numbers = runs
			.map((run) => (run.first === run.last ? run.first : `${run.first}–${run.last}`))
			.join(", ");
		const same = rows.find((row) => row.numbers === numbers);
		if (same) {
			same.types.push(airType);
		} else {
			rows.push({
				types: [airType],
				count: numbered.length,
				numbers,
			});
		}
	}

	return rows.map((row) => ({
		key: `${versions[0].series.id}:${row.types.join()}`,
		series: versions[0].series,
		episodes: `${row.count === 1 ? "Episode" : "Episodes"} ${row.numbers}`,
		language: audioLabel(row.types),
	}));
}

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

		const monday = today.data
			.subtract({
				days: today.data.dayOfWeek - 1,
			})
			.add({
				weeks,
			});
		const sunday = monday.add({
			days: 6,
		});

		const episodes = await remoteViewer().sora.request(route.getSchedule, {
			query: {
				from: new Date(monday.toZonedDateTime(timeZone).epochMilliseconds).toISOString(),
				until: new Date(
					sunday
						.add({
							days: 1,
						})
						.toZonedDateTime(timeZone).epochMilliseconds,
				).toISOString(),
			},
		});

		const now = Date.now();
		const clock = (instant: Temporal.Instant) =>
			instant.toZonedDateTimeISO(timeZone).toLocaleString("en", {
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			});
		const empty = !episodes.length;
		const ahead = weeks > 1;

		const days = Array.from(
			{
				length: 7,
			},
			(_, index) => {
				const date = monday.add({
					days: index,
				});
				const isToday = date.equals(today.data);
				const airing = episodes.filter((episode) =>
					Temporal.Instant.from(episode.airing_at)
						.toZonedDateTimeISO(timeZone)
						.toPlainDate()
						.equals(date),
				);
				const name = date.toLocaleString("en", {
					weekday: "long",
				});

				const slots = [...Map.groupBy(airing, (episode) => episode.airing_at)].map(
					([at, group], position, all) => {
						const aired = Date.parse(at) <= now;
						const previous = all[position - 1];
						return {
							at,
							time: clock(Temporal.Instant.from(at)),
							aired,
							now: isToday && !aired && (!previous || Date.parse(previous[0]) <= now),
							releases: [...Map.groupBy(group, (episode) => episode.series.id).values()].flatMap(
								releases,
							),
						};
					},
				);

				return {
					date: date.toString(),
					today: isToday,
					weekday: isToday ? "Today" : date.toLocaleString("en", { weekday: "short" }),
					name,
					label: date.toLocaleString("en", {
						weekday: "long",
						month: "long",
						day: "numeric",
					}),
					number: date.day,
					monthDay: date.toLocaleString("en", {
						month: "long",
						day: "numeric",
					}),
					count: airing.length,
					slots,
					nothing: empty
						? ahead
							? {
									title: "The schedule for this week isn't out yet.",
									hint: "Check back closer to the week.",
								}
							: {
									title: "There's no schedule for this week.",
									hint: "Try another week.",
								}
						: {
								title: `Nothing airs on ${name}.`,
								hint: "Pick another day to see what's coming out.",
							},
				};
			},
		);

		return {
			week: new Intl.DateTimeFormat("en", {
				month: "short",
				day: "numeric",
				year: "numeric",
			}).formatRange(monday, sunday),
			now: clock(Temporal.Instant.fromEpochMilliseconds(now)),
			days,
		};
	},
);
