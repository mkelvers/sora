import { attempt, day } from "@sora/shared";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, or } from "drizzle-orm";

import { db } from "../database/client";
import { animeScheduleRelease, animeScheduleShow } from "../database/schema/playback";
import { series } from "../database/schema/series";
import { InvalidInputError } from "../errors";
import type { Calendar, ScheduledEpisode } from "../models/series";
import { anilistKey } from "./episodes";
import { toCards } from "./queries";
import { store } from "./store";
import { TitleSlot } from "./title-slot";

/**
 * How far past the window {@link schedule.airing} looks for an episode's
 * other time, so an episode whose raw broadcast and subbed stream fall on
 * either side of the window's edge is listed once. Subs follow the raw
 * broadcast by up to a few hours.
 */
const pairingMarginMs = day;

export const schedule = {
	/**
	 * Lists episodes coming out between `from` (inclusive) and `until`
	 * (exclusive) as AnimeSchedule's timetable has them, in order. An episode
	 * is listed once subbed and once dubbed, as it comes out.
	 *
	 * Donghua and shows with episodes under {@link shortEpisodeMinutes} are
	 * left out, as AnimeSchedule's timetable marks them.
	 *
	 * Every raw broadcast counts as subbed, since subs follow it wherever
	 * episodes are streamed from; an official subbed stream, where there is
	 * one, gives the time instead.
	 *
	 * Reads only the database, which the scheduler keeps from last week to next
	 * week; see `timetables.sync`. Only stored titles are listed: the scheduler
	 * queues the rest as it stores the timetable, and they appear once stored.
	 *
	 * @throws {InvalidInputError} when the window is empty or longer than 14 days.
	 */
	async airing(from: Date, until: Date): Promise<ScheduledEpisode[]> {
		/**
		 * Episodes shorter than this, in minutes, are not scheduled: AniList files
		 * them as `TV_SHORT`, which the catalogue leaves out as well.
		 */
		const shortEpisodeMinutes = 15;

		/** The longest window {@link schedule.airing} accepts. */
		const maximumWindowMs = 14 * day;

		const windowMs = until.getTime() - from.getTime();

		if (!(windowMs > 0 && windowMs <= maximumWindowMs)) {
			throw new InvalidInputError("The schedule window must be between 0 and 14 days long");
		}

		const releases = await db
			.select({
				airType: animeScheduleRelease.airType,
				airsAt: animeScheduleRelease.airsAt,
				anilistId: animeScheduleShow.anilistId,
				episode: animeScheduleRelease.episode,
			})
			.from(animeScheduleRelease)
			.innerJoin(animeScheduleShow, eq(animeScheduleShow.route, animeScheduleRelease.route))
			.where(
				and(
					gte(animeScheduleRelease.airsAt, new Date(from.getTime() - pairingMarginMs)),
					lt(animeScheduleRelease.airsAt, new Date(until.getTime() + pairingMarginMs)),
					isNotNull(animeScheduleShow.anilistId),
					eq(animeScheduleRelease.donghua, false),
					or(
						isNull(animeScheduleRelease.lengthMinutes),
						gte(animeScheduleRelease.lengthMinutes, shortEpisodeMinutes),
					),
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

			let airType: "sub" | "dub" = "sub";

			if (release.airType === "dub") {
				airType = "dub";
			}

			const key = `${anilistKey(release.anilistId, release.episode)}:${airType}`;
			const fromSubStream = release.airType === "sub";

			if (!chosen.get(key)?.fromSubStream) {
				chosen.set(key, {
					airType,
					airsAt: release.airsAt,
					anilistId: release.anilistId,
					episode: release.episode,
					fromSubStream,
				});
			}
		}

		const broadcasts = [...chosen.values()]
			.filter((broadcast) => broadcast.airsAt >= from && broadcast.airsAt < until)
			.toSorted((left, right) => left.airsAt.getTime() - right.airsAt.getTime());

		const storedIds = await store.ids(broadcasts.map((broadcast) => broadcast.anilistId));
		let rows: (typeof series.$inferSelect)[] = [];

		if (storedIds.size > 0) {
			rows = await db
				.select()
				.from(series)
				.where(inArray(series.id, [...storedIds.values()]));
		}

		const cards = await toCards(rows);

		return broadcasts.flatMap((broadcast) => {
			const id = storedIds.get(broadcast.anilistId);

			if (!id) {
				return [];
			}

			const card = cards.get(id);

			if (card) {
				return [
					{
						air_type: broadcast.airType,
						airing_at: broadcast.airsAt.toISOString(),
						episode: broadcast.episode,
						series: card,
					},
				];
			}

			return [];
		});
	},

	/**
	 * A week of {@link schedule.airing} laid out as a calendar in a time zone:
	 * each day from Monday to Sunday, the times episodes come out on it, and
	 * what comes out at each, with a title's subbed and dubbed episodes merged
	 * when they are the same ones.
	 *
	 * @param weeks - How many weeks after this one; negative for earlier weeks.
	 * @throws {InvalidInputError} when the time zone is unknown.
	 */
	async calendar(timeZone: string, weeks: number): Promise<Calendar> {
		const today = attempt(() => Temporal.Now.plainDateISO(timeZone), RangeError);

		if (today.error) {
			throw new InvalidInputError(`Unknown time zone ${timeZone}`);
		}

		const monday = today.data.subtract({ days: today.data.dayOfWeek - 1 }).add({ weeks });
		const sunday = monday.add({ days: 6 });

		const episodes = await schedule.airing(
			new Date(monday.toZonedDateTime(timeZone).epochMilliseconds),
			new Date(sunday.add({ days: 1 }).toZonedDateTime(timeZone).epochMilliseconds),
		);

		const now = Date.now();

		const clock = (epochMs: number) =>
			Temporal.Instant.fromEpochMilliseconds(epochMs)
				.toZonedDateTimeISO(timeZone)
				.toLocaleString("en", {
					hour: "2-digit",
					hourCycle: "h23",
					minute: "2-digit",
				});

		return {
			days: Array.from({ length: 7 }, (_, index) => {
				const date = monday.add({ days: index });
				const isToday = date.equals(today.data);
				let shortName = date.toLocaleString("en", { weekday: "short" });

				if (isToday) {
					shortName = "Today";
				}

				const airing = episodes.filter((episode) =>
					Temporal.Instant.from(episode.airing_at)
						.toZonedDateTimeISO(timeZone)
						.toPlainDate()
						.equals(date),
				);

				const slots = [...Map.groupBy(airing, (episode) => episode.airing_at)];

				return {
					count: airing.length,
					date: date.toString(),
					label: date.toLocaleString("en", {
						day: "numeric",
						month: "long",
						weekday: "long",
					}),
					month_day: date.toLocaleString("en", {
						day: "numeric",
						month: "long",
					}),
					name: date.toLocaleString("en", { weekday: "long" }),
					number: date.day,
					short_name: shortName,
					slots: slots.map(([at, group], position) => {
						const aired = Date.parse(at) <= now;
						const previous = slots[position - 1];

						return {
							aired,
							airing_at: at,
							next: isToday && !aired && (!previous || Date.parse(previous[0]) <= now),
							releases: [...Map.groupBy(group, (episode) => episode.series.id).values()].flatMap(
								(versions) => new TitleSlot(versions).releases,
							),
							time: clock(Date.parse(at)),
						};
					}),
					today: isToday,
				};
			}),
			now: clock(now),
			week: new Intl.DateTimeFormat("en", {
				day: "numeric",
				month: "short",
				year: "numeric",
			}).formatRange(monday, sunday),
		};
	},
};
