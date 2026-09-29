import type { HttpClient } from "anime-sdk";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { config } from "../config";
import { db } from "../database/client";
import { animeScheduleShow } from "../database/schema";
import { day } from "../time";

const apiUrl = "https://animeschedule.net/api/v3";

/** Every request carries the app's token; see the API's documentation. */
const headers = {
	Authorization: `Bearer ${config.animeScheduleApiKey}`,
};

/** One release in AnimeSchedule's timetable, as far as it is read. */
const TimetableEntrySchema = z.object({
	route: z.string().min(1),
	episodeNumber: z.number(),
	episodeDate: z.iso.datetime({
		offset: true,
	}),
});

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

/** One dubbed episode in AnimeSchedule's timetable. */
export interface DubRelease {
	/** The show's path on AnimeSchedule; see {@link resolveAnimeScheduleShows}. */
	route: string;
	/** The episode, numbered as the AniList entry numbers it. */
	episode: number;
	airsAt: Date;
}

/**
 * Reads the dubbed episodes AnimeSchedule's timetable lists for one ISO
 * week, Monday to Sunday: one request, about 35 KB. Times are in UTC.
 *
 * An entry that does not match {@link TimetableEntrySchema} is left out
 * rather than failing the rest.
 *
 * @throws when AnimeSchedule cannot be read.
 */
export async function fetchDubReleases(
	http: HttpClient,
	week: {
		year: number;
		week: number;
	},
): Promise<DubRelease[]> {
	const response = await http.get(
		`${apiUrl}/timetables/dub?year=${week.year}&week=${week.week}&tz=UTC`,
		{
			headers,
		},
	);

	return z
		.array(z.unknown())
		.parse(await response.json())
		.flatMap((item) => {
			const entry = TimetableEntrySchema.safeParse(item);
			return entry.success
				? [
						{
							route: entry.data.route,
							episode: entry.data.episodeNumber,
							airsAt: new Date(entry.data.episodeDate),
						},
					]
				: [];
		});
}

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
export async function resolveAnimeScheduleShows(
	http: HttpClient,
	routes: readonly string[],
): Promise<Map<string, number | null>> {
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

	for (const route of unique.filter((route) => !resolved.has(route))) {
		let anilistId: number | null;
		try {
			const response = await http.get(`${apiUrl}/anime/${encodeURIComponent(route)}`, {
				headers,
			});
			const link = AnimeSchema.parse(await response.json()).websites?.aniList;
			const id = link ? /anilist\.co\/anime\/(\d+)/.exec(link)?.[1] : undefined;
			anilistId = id ? Number(id) : null;
		} catch {
			continue;
		}

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
				target: animeScheduleShow.route,
				set: values,
			});
		resolved.set(route, anilistId);
	}

	return resolved;
}

/** The ISO week `date` falls in, in UTC: weeks start on Monday, and week 1 holds the year's first Thursday. */
export function isoWeek(date: Date) {
	const thursday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
	thursday.setUTCDate(thursday.getUTCDate() + 3 - ((thursday.getUTCDay() + 6) % 7));
	const year = thursday.getUTCFullYear();
	return {
		year,
		week: Math.floor((thursday.getTime() - Date.UTC(year, 0, 1)) / (7 * day)) + 1,
	};
}
