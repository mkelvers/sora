import { attempt, day, sequence } from "@sora/shared";
import type { HttpClient } from "anime-sdk";
import { and, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";

import { config } from "../config";
import { db } from "../database/client";
import { animeScheduleRelease, animeScheduleShow } from "../database/schema/playback";
import type { AirType } from "../database/schema/playback";
import { Entry } from "./entry";

const api = "https://animeschedule.net/api/v3";

/** Every request carries the app's token; see the API's documentation. */
const headers = {
	Authorization: `Bearer ${config.animeScheduleApiKey}`,
};

/** One episode in AnimeSchedule's timetable. */
export interface TimetableRelease {
	/** The show's path on AnimeSchedule; see {@link Shows}. */
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
 * {@link Entry.heldBack}. An entry that does not match {@link Entry.schema}
 * is left out rather than failing the rest.
 *
 * @throws {Error} when AnimeSchedule cannot be read.
 */
export const fetchWeek = async (
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
			const entry = Entry.schema.safeParse(item);

			if (!entry.success || new Entry(entry.data).heldBack) {
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

/** AnimeSchedule shows, by their routes. */
class Shows {
	readonly #http: HttpClient;
	readonly #routes: string[];

	constructor(http: HttpClient, routes: readonly string[]) {
		this.#http = http;
		this.#routes = [...new Set(routes)];
	}

	/**
	 * The AniList entry of each show, as the show links it, or `null` when it
	 * links none.
	 *
	 * Stored links are reused; a show not stored yet is looked up once, a
	 * request each, since the API matches several AniList IDs only when one
	 * show has them all. One linking nothing is looked up again after a week,
	 * and one that cannot be looked up is left out.
	 */
	async links(): Promise<Map<string, number | null>> {
		/** How long a show that links no AniList entry waits before it is looked up again. */
		const unlinkedLifetimeMs = 7 * day;

		/** One show, as far as it is read: its links elsewhere, such as `anilist.co/anime/195600/…`. */
		const AnimeSchema = z.object({
			websites: z
				.object({
					aniList: z.string().nullish(),
				})
				.nullish(),
		});

		const unique = this.#routes;

		if (unique.length === 0) {
			return new Map();
		}

		const stored = await db
			.select()
			.from(animeScheduleShow)
			.where(inArray(animeScheduleShow.route, unique));

		const resolved = new Map(
			stored.flatMap((show) => {
				if (
					show.anilistId !== null ||
					show.resolvedAt.getTime() + unlinkedLifetimeMs > Date.now()
				) {
					return [[show.route, show.anilistId] as const];
				}

				return [];
			}),
		);

		await sequence.all(
			unique.filter((candidate) => !resolved.has(candidate)),
			async (route) => {
				const response = await attempt(
					this.#http.get(`${api}/anime/${encodeURIComponent(route)}`, {
						headers,
					}),
				);

				if (response.error) {
					console.warn(
						`AnimeSchedule show ${route} could not be fetched: ${response.error.message}`,
					);

					return;
				}

				const body = await attempt(response.data.json());
				const show = AnimeSchema.safeParse(body.data);

				if (!show.success) {
					console.warn(`AnimeSchedule show ${route} could not be read`);

					return;
				}

				const link = show.data.websites?.aniList;
				const id = link && /anilist\.co\/anime\/(?<id>\d+)/u.exec(link)?.[1];
				let anilistId: number | null = null;

				if (id) {
					anilistId = Number(id);
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
						set: values,
						target: animeScheduleShow.route,
					});
				resolved.set(route, anilistId);
			},
		);

		return resolved;
	}
}

export const timetables = {
	/**
	 * Stores AnimeSchedule's timetable from last week to next week in
	 * {@link animeScheduleRelease}, replacing what each week held, and links
	 * shows it has not seen before to their AniList entries; see
	 * {@link Shows.links}.
	 *
	 * Asks AnimeSchedule's API three times, plus once for each new show.
	 *
	 * @returns The AniList entries of the stored episodes.
	 * @throws {Error} when AnimeSchedule cannot be read; weeks read before then stay stored.
	 */
	async sync(http: HttpClient, now = new Date()): Promise<number[]> {
		/** The weeks {@link timetables.sync} keeps, counted from this week. */
		const syncedWeeks = [-1, 0, 1];

		const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
		const thisMonday = new Date(midnight - ((now.getUTCDay() + 6) % 7) * day);
		const anilistIds = new Set<number>();

		await sequence.all(syncedWeeks, async (offset) => {
			const monday = new Date(thisMonday.getTime() + offset * 7 * day);
			const nextMonday = new Date(monday.getTime() + 7 * day);
			const timetable = await fetchWeek(http, isoWeek(monday));

			const releases = [
				...new Map(
					timetable.map((release) => [
						`${release.route}:${release.airType}:${release.episode}`,
						release,
					]),
				).values(),
			];

			const shows = await new Shows(
				http,
				releases.map((release) => release.route),
			).links();

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
		});

		return [...anilistIds];
	},
};
