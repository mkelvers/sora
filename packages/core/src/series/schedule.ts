import { attempt } from "@sora/shared";
import { and, asc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";

import { db } from "../database/client";
import { animeScheduleRelease, animeScheduleShow, series } from "../database/schema";
import { InvalidInputError } from "../errors";
import type { Calendar, ScheduledEpisode } from "../models/series";
import { day } from "../time";
import { anilistEpisodeKey } from "./episodes";
import { toSeriesCards } from "./queries";
import { storedSeriesIds } from "./store";

/** The longest window {@link getAiringSchedule} accepts. */
const maximumScheduleWindowMs = 14 * day;

/**
 * How far past the window {@link getAiringSchedule} looks for an episode's
 * other time, so an episode whose raw broadcast and subbed stream fall on
 * either side of the window's edge is listed once. Subs follow the raw
 * broadcast by up to a few hours.
 */
const pairingMarginMs = day;

/**
 * Lists episodes coming out between `from` (inclusive) and `until`
 * (exclusive) as AnimeSchedule's timetable has them, in order. An episode
 * is listed once subbed and once dubbed, as it comes out.
 *
 * Every raw broadcast counts as subbed, since subs follow it wherever
 * episodes are streamed from; an official subbed stream, where there is
 * one, gives the time instead.
 *
 * Reads only the database, which the scheduler keeps from last week to next
 * week; see `syncTimetables`. Only stored titles are listed: the scheduler
 * queues the rest as it stores the timetable, and they appear once stored.
 *
 * @throws {@link InvalidInputError} when the window is empty or longer than 14 days.
 */
export async function getAiringSchedule(from: Date, until: Date): Promise<ScheduledEpisode[]> {
	const windowMs = until.getTime() - from.getTime();
	if (!(windowMs > 0 && windowMs <= maximumScheduleWindowMs)) {
		throw new InvalidInputError("The schedule window must be between 0 and 14 days long");
	}

	const releases = await db
		.select({
			anilistId: animeScheduleShow.anilistId,
			airType: animeScheduleRelease.airType,
			episode: animeScheduleRelease.episode,
			airsAt: animeScheduleRelease.airsAt,
		})
		.from(animeScheduleRelease)
		.innerJoin(animeScheduleShow, eq(animeScheduleShow.route, animeScheduleRelease.route))
		.where(
			and(
				gte(animeScheduleRelease.airsAt, new Date(from.getTime() - pairingMarginMs)),
				lt(animeScheduleRelease.airsAt, new Date(until.getTime() + pairingMarginMs)),
				isNotNull(animeScheduleShow.anilistId),
			),
		)
		.orderBy(asc(animeScheduleRelease.airsAt), asc(animeScheduleRelease.route));

	const chosen = new Map<
		string,
		{
			anilistId: number;
			episode: number;
			airType: "sub" | "dub";
			fromSubStream: boolean;
			airsAt: Date;
		}
	>();
	for (const release of releases) {
		if (release.anilistId === null) {
			continue;
		}

		const airType = release.airType === "dub" ? "dub" : "sub";
		const key = `${anilistEpisodeKey(release.anilistId, release.episode)}:${airType}`;
		const fromSubStream = release.airType === "sub";
		if (!chosen.get(key)?.fromSubStream) {
			chosen.set(key, {
				anilistId: release.anilistId,
				episode: release.episode,
				airType,
				fromSubStream,
				airsAt: release.airsAt,
			});
		}
	}
	const broadcasts = [...chosen.values()]
		.filter((broadcast) => broadcast.airsAt >= from && broadcast.airsAt < until)
		.toSorted((left, right) => left.airsAt.getTime() - right.airsAt.getTime());
	const seriesIds = await storedSeriesIds(broadcasts.map((broadcast) => broadcast.anilistId));
	const rows =
		seriesIds.size > 0
			? await db
					.select()
					.from(series)
					.where(inArray(series.id, [...seriesIds.values()]))
			: [];
	const cards = await toSeriesCards(rows);

	return broadcasts.flatMap((broadcast) => {
		const seriesId = seriesIds.get(broadcast.anilistId);
		const card = seriesId ? cards.get(seriesId) : undefined;
		return card
			? [
					{
						series: card,
						episode: broadcast.episode,
						air_type: broadcast.airType,
						airing_at: broadcast.airsAt.toISOString(),
					},
				]
			: [];
	});
}

/**
 * A week of {@link getAiringSchedule} laid out as a calendar in a time zone:
 * each day from Monday to Sunday, the times episodes come out on it, and
 * what comes out at each, with a title's subbed and dubbed episodes merged
 * when they are the same ones.
 *
 * @param weeks - How many weeks after this one; negative for earlier weeks.
 * @throws {@link InvalidInputError} when the time zone is unknown.
 */
export async function getCalendar(timeZone: string, weeks: number): Promise<Calendar> {
	const today = attempt(() => Temporal.Now.plainDateISO(timeZone), RangeError);
	if (today.error) {
		throw new InvalidInputError(`Unknown time zone ${timeZone}`);
	}

	const monday = today.data.subtract({ days: today.data.dayOfWeek - 1 }).add({ weeks });
	const sunday = monday.add({ days: 6 });
	const episodes = await getAiringSchedule(
		new Date(monday.toZonedDateTime(timeZone).epochMilliseconds),
		new Date(sunday.add({ days: 1 }).toZonedDateTime(timeZone).epochMilliseconds),
	);
	const now = Date.now();
	const clock = (epochMs: number) =>
		Temporal.Instant.fromEpochMilliseconds(epochMs)
			.toZonedDateTimeISO(timeZone)
			.toLocaleString("en", {
				hour: "2-digit",
				minute: "2-digit",
				hourCycle: "h23",
			});

	return {
		week: new Intl.DateTimeFormat("en", {
			month: "short",
			day: "numeric",
			year: "numeric",
		}).formatRange(monday, sunday),
		now: clock(now),
		days: Array.from({ length: 7 }, (_, index) => {
			const date = monday.add({ days: index });
			const isToday = date.equals(today.data);
			const airing = episodes.filter((episode) =>
				Temporal.Instant.from(episode.airing_at)
					.toZonedDateTimeISO(timeZone)
					.toPlainDate()
					.equals(date),
			);
			const slots = [...Map.groupBy(airing, (episode) => episode.airing_at)];

			return {
				date: date.toString(),
				today: isToday,
				name: date.toLocaleString("en", { weekday: "long" }),
				short_name: isToday ? "Today" : date.toLocaleString("en", { weekday: "short" }),
				label: date.toLocaleString("en", { weekday: "long", month: "long", day: "numeric" }),
				month_day: date.toLocaleString("en", { month: "long", day: "numeric" }),
				number: date.day,
				count: airing.length,
				slots: slots.map(([at, group], position) => {
					const aired = Date.parse(at) <= now;
					const previous = slots[position - 1];
					return {
						airing_at: at,
						time: clock(Date.parse(at)),
						aired,
						next: isToday && !aired && (!previous || Date.parse(previous[0]) <= now),
						releases: [...Map.groupBy(group, (episode) => episode.series.id).values()].flatMap(
							calendarReleases,
						),
					};
				}),
			};
		}),
	};
}

/**
 * One title's episodes at one time as calendar entries: one for its subbed
 * and one for its dubbed episodes, or a single one when they are the same.
 */
function calendarReleases(versions: ScheduledEpisode[]) {
	const audioByEpisodes = new Map<string, ("sub" | "dub")[]>();
	for (const airType of ["sub", "dub"] as const) {
		const numbers = versions
			.filter((version) => version.air_type === airType)
			.map((version) => version.episode)
			.toSorted((left, right) => left - right);
		if (!numbers.length) {
			continue;
		}

		const runs: [number, number][] = [];
		for (const number of numbers) {
			const run = runs.at(-1);
			if (run?.[1] === number - 1) {
				run[1] = number;
			} else {
				runs.push([number, number]);
			}
		}

		const episodes = `${numbers.length === 1 ? "Episode" : "Episodes"} ${runs
			.map(([first, last]) => (first === last ? first : `${first}–${last}`))
			.join(", ")}`;
		audioByEpisodes.set(episodes, [...(audioByEpisodes.get(episodes) ?? []), airType]);
	}

	return [...audioByEpisodes].map(([episodes, audio]) => ({
		series: versions[0]!.series,
		audio,
		episodes,
	}));
}
