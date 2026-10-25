import { attempt, day } from "@sora/shared";
import type { HttpClient } from "anime-sdk";
import { and, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { config } from "../config";
import { db } from "../database/client";
import { animeScheduleRelease, animeScheduleShow } from "../database/schema";
import type { AirType } from "../database/schema";

const api = "https://animeschedule.net/api/v3";

/** Every request carries the app's token; see the API's documentation. */
const headers = {
	Authorization: `Bearer ${config.animeScheduleApiKey}`,
};

/** One release in AnimeSchedule's timetable, as far as it is read. */
const TimetableEntrySchema = z.object({
	airType: z.enum(["raw", "sub", "dub"]),
	airingStatus: z.string(),
	/** When the hold starts and ends; `0001-01-01T00:00:00Z` when not known. */
	delayedFrom: z.iso
		.datetime({
			offset: true,
		})
		.optional(),
	/** Set, as `Delayed` or `Break`, while the episode is held back; see {@link isHeldBack}. */
	delayedText: z.string().optional(),
	delayedUntil: z.iso
		.datetime({
			offset: true,
		})
		.optional(),
	/** Whether the show is a Chinese animation, which AnimeSchedule files apart from anime. */
	donghua: z.boolean().optional(),
	episodeDate: z.iso.datetime({
		offset: true,
	}),
	episodeNumber: z.number().int().positive(),
	/** The length of an episode in minutes; absent or 0 when not known. */
	lengthMin: z.number().int().nonnegative().nullish(),
	route: z.string().min(1),
	/** How many episodes before `episodeNumber` come out with it, as in a double-episode premiere. */
	subtractedEpisodeNumber: z.number().int().nonnegative().optional(),
});

/** A date AnimeSchedule sends for one it does not know. */
const unknownDate = "0001-01-01T00:00:00Z";

/**
 * Whether an entry is held back rather than coming out when listed. The
 * timetable keeps a delayed episode in each week until it airs, marked
 * `delayed-air` in the week it was due and only by `delayedText` in the
 * weeks between, so a listed time within the hold is not when it airs.
 */
const isHeldBack = (entry: z.infer<typeof TimetableEntrySchema>) => {
	if (entry.airingStatus === "delayed-air") {
		return true;
	}
	if (!entry.delayedText) {
		return false;
	}

	const airsAt = Date.parse(entry.episodeDate);
	const from =
		entry.delayedFrom && entry.delayedFrom !== unknownDate ? Date.parse(entry.delayedFrom) : null;
	const until =
		entry.delayedUntil && entry.delayedUntil !== unknownDate
			? Date.parse(entry.delayedUntil)
			: null;
	return (from === null || airsAt >= from) && (until === null || airsAt < until);
};

/** One show, as far as it is read: its links elsewhere, such as `anilist.co/anime/195600/…`. */
const AnimeSchema = z.object({
	websites: z
		.object({
			aniList: z.string().nullish(),
		})
		.nullish(),
});

/** How long a show that links no AniList entry waits before it is looked up again. */
const unlinkedShowLifetimeMs = 7 * day;

/** One episode in AnimeSchedule's timetable. */
export interface TimetableRelease {
	/** The show's path on AnimeSchedule; see {@link resolveAnimeScheduleShows}. */
	route: string;
	airType: AirType;
	/** The episode, numbered as the AniList entry numbers it. */
	episode: number;
	airsAt: Date;
	donghua: boolean;
	/** The length of an episode in minutes; `null` when AnimeSchedule does not know it. */
	lengthMinutes: number | null;
}

/**
 * Reads every episode AnimeSchedule's timetable lists for one ISO week,
 * Monday to Sunday, raw, subbed, and dubbed: one request, about 130 KB.
 * Times are in UTC. An entry for several episodes at once, such as a
 * double-episode premiere, is listed as each of them.
 *
 * A delayed episode is left out until the week it airs; see
 * {@link isHeldBack}. An entry that does not match
 * {@link TimetableEntrySchema} is left out rather than failing the rest.
 *
 * @throws {Error} when AnimeSchedule cannot be read.
 */
export const fetchTimetable = async (
	http: HttpClient,
	week: {
		year: number;
		week: number;
	},
): Promise<TimetableRelease[]> => {
	const response = await http.get(
		`${api}/timetables/all?year=${week.year}&week=${week.week}&tz=UTC`,
		{
			headers,
		},
	);

	return z
		.array(z.unknown())
		.parse(await response.json())
		.flatMap((item) => {
			const entry = TimetableEntrySchema.safeParse(item);
			if (!entry.success || isHeldBack(entry.data)) {
				return [];
			}

			const last = entry.data.episodeNumber;
			const first = Math.max(1, last - (entry.data.subtractedEpisodeNumber ?? 0));
			return Array.from(
				{
					length: last - first + 1,
				},
				(_, index) => ({
					airType: entry.data.airType,
					airsAt: new Date(entry.data.episodeDate),
					donghua: entry.data.donghua ?? false,
					episode: first + index,
					lengthMinutes: entry.data.lengthMin || null,
					route: entry.data.route,
				}),
			);
		});
};

/** The weeks {@link syncTimetables} keeps, counted from this week. */
const syncedWeeks = [-1, 0, 1];

/** The ISO week `date` falls in, in UTC: weeks start on Monday, and week 1 holds the year's first Thursday. */
export const isoWeek = (date: Date) => {
	const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
	const year = thursday.getUTCFullYear();
	return {
		week: Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * day)) + 1,
		year,
	};
};

/**
 * The AniList entry of each AnimeSchedule show, as the show links it, or
 * `null` when it links none.
 *
 * Stored links are reused; a show not stored yet is looked up once, a
 * request each, since the API matches several AniList IDs only when one
 * show has them all. One linking nothing is looked up again after
 * {@link unlinkedShowLifetimeMs}, and one that cannot be looked up is left
 * out.
 */
const resolveAnimeScheduleShows = async (
	http: HttpClient,
	routes: readonly string[],
): Promise<Map<string, number | null>> => {
	const unique = [...new Set(routes)];
	if (unique.length === 0) {
		return new Map();
	}

	const stored = await db
		.select()
		.from(animeScheduleShow)
		.where(inArray(animeScheduleShow.route, unique));
	const resolved = new Map(
		stored.flatMap((show) =>
			show.anilistId !== null || show.resolvedAt.getTime() + unlinkedShowLifetimeMs > Date.now()
				? [[show.route, show.anilistId] as const]
				: [],
		),
	);

	for (const route of unique.filter((candidate) => !resolved.has(candidate))) {
		const response = await attempt(
			http.get(`${api}/anime/${encodeURIComponent(route)}`, {
				headers,
			}),
		);
		if (response.error) {
			console.warn(`AnimeSchedule show ${route} could not be fetched: ${response.error.message}`);
			continue;
		}

		const body = await attempt(response.data.json());
		const show = AnimeSchema.safeParse(body.data);
		if (!show.success) {
			console.warn(`AnimeSchedule show ${route} could not be read`);
			continue;
		}

		const link = show.data.websites?.aniList;
		const id = link ? /anilist\.co\/anime\/(?<id>\d+)/u.exec(link)?.[1] : undefined;
		const anilistId = id ? Number(id) : null;

		const values = {
			anilistId,
			resolvedAt: new Date(),
		};
		await db
			.insert(animeScheduleShow)
			.values({
				route,
				...values,
			})
			.onConflictDoUpdate({
				set: values,
				target: animeScheduleShow.route,
			});
		resolved.set(route, anilistId);
	}

	return resolved;
};

/**
 * Stores AnimeSchedule's timetable from last week to next week in
 * {@link animeScheduleRelease}, replacing what each week held, and links
 * shows it has not seen before to their AniList entries; see
 * {@link resolveAnimeScheduleShows}.
 *
 * Asks AnimeSchedule's API three times, plus once for each new show.
 *
 * @returns The AniList entries of the stored episodes.
 * @throws {Error} when AnimeSchedule cannot be read; weeks read before then stay stored.
 */
export const syncTimetables = async (http: HttpClient, now = new Date()): Promise<number[]> => {
	const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	const thisMonday = new Date(midnight - ((now.getUTCDay() + 6) % 7) * day);
	const anilistIds = new Set<number>();

	for (const offset of syncedWeeks) {
		const monday = new Date(thisMonday.getTime() + offset * 7 * day);
		const nextMonday = new Date(monday.getTime() + 7 * day);
		const timetable = await fetchTimetable(http, isoWeek(monday));
		const releases = [
			...new Map(
				timetable.map((release) => [
					`${release.route}:${release.airType}:${release.episode}`,
					release,
				]),
			).values(),
		];
		const shows = await resolveAnimeScheduleShows(
			http,
			releases.map((release) => release.route),
		);

		await db.transaction(async (tx) => {
			await tx
				.delete(animeScheduleRelease)
				.where(
					and(
						gte(animeScheduleRelease.airsAt, monday),
						lt(animeScheduleRelease.airsAt, nextMonday),
					),
				);
			if (releases.length > 0) {
				await tx
					.insert(animeScheduleRelease)
					.values(releases)
					.onConflictDoUpdate({
						set: {
							airsAt: sql`excluded.airs_at`,
							donghua: sql`excluded.donghua`,
							lengthMinutes: sql`excluded.length_minutes`,
						},
						target: [
							animeScheduleRelease.route,
							animeScheduleRelease.airType,
							animeScheduleRelease.episode,
						],
					});
			}
		});

		for (const release of releases) {
			const anilistId = shows.get(release.route);
			if (anilistId) {
				anilistIds.add(anilistId);
			}
		}
	}

	return [...anilistIds];
};
