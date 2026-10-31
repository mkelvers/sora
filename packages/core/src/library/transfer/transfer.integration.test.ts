import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { and, eq, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { episodeProgress, seriesState } from "../../database/schema/library";
import { exportLibrary, importLibrary } from "./transfer";

interface Title {
	anilistId: number;
	malId: number;
	released: number;
	seriesId: string;
}

// Opt in against a local database with migrations applied and stored series.
// The fixture profile is removed even when an assertion fails.
describe.skipIf(process.env.SORA_TRANSFER_INTEGRATION !== "1")("library import and export", () => {
	const profile = `transfer-test-${crypto.randomUUID()}`;
	const now = new Date();
	let titles: Title[] = [];

	beforeAll(async () => {
		const rows = await db.execute<{
			anilist_id: number;
			mal_id: number;
			released: number;
			series_id: string;
		}>(sql`
			select s.id as series_id, s.anilist_id, (a.media->>'idMal')::int as mal_id, count(e.number)::int as released
			from series s
			join anime a on a.anilist_id = s.anilist_id
			join series_episode e on e.series_id = s.id and e.aired_at < now()
			where a.media->>'idMal' is not null
			group by 1, 2, 3
			having count(e.number) between 2 and 30
			order by s.anilist_id
			limit 3
		`);
		titles = [...rows].map((row) => ({
			anilistId: row.anilist_id,
			malId: row.mal_id,
			released: row.released,
			seriesId: row.series_id,
		}));
		expect(titles).toHaveLength(3);
	});

	afterAll(async () => {
		await db.delete(episodeProgress).where(eq(episodeProgress.userId, profile));
		await db.delete(seriesState).where(eq(seriesState.userId, profile));
	});

	const file = (history: boolean) => ({
		document: {
			exported_at: now.toISOString(),
			format: "sora-library" as const,
			history: history
				? [
						{
							anilist_id: titles[0]?.anilistId ?? 0,
							duration_seconds: 1400,
							episode: 1,
							finished: true,
							position_seconds: 1400,
							rewatch: false,
							watched_at: now.toISOString(),
						},
					]
				: [],
			version: 1 as const,
			watchlist: [
				{
					added_at: now.toISOString(),
					anilist_id: titles[0]?.anilistId ?? 0,
					status: "watching" as const,
					title: "First",
				},
				{
					added_at: now.toISOString(),
					anilist_id: titles[1]?.anilistId ?? 0,
					status: "plan_to_watch" as const,
					title: "Second",
				},
			],
		},
		source: "sora" as const,
	});

	test("adds a file's watchlist and history", async () => {
		const report = await importLibrary(profile, file(true));

		expect(report.watchlist_added).toBe(2);
		expect(report.episodes_added).toBe(1);
		expect(report.not_in_sora_count).toBe(0);
	});

	test("changes nothing when the same file is imported again", async () => {
		const report = await importLibrary(profile, file(true));

		expect(report.watchlist_added).toBe(0);
		expect(report.watchlist_kept).toBe(2);
		expect(report.episodes_added).toBe(0);
	});

	test("keeps the status a title already has", async () => {
		await db
			.update(seriesState)
			.set({ status: "completed" })
			.where(
				and(eq(seriesState.userId, profile), eq(seriesState.seriesId, titles[0]?.seriesId ?? "")),
			);
		await importLibrary(profile, file(false));
		const [row] = await db
			.select({ status: seriesState.status })
			.from(seriesState)
			.where(
				and(eq(seriesState.userId, profile), eq(seriesState.seriesId, titles[0]?.seriesId ?? "")),
			);

		expect(row?.status).toBe("completed");
	});

	test("exports what was imported, by AniList ID", async () => {
		const exported = await exportLibrary(profile);

		expect(exported.format).toBe("sora-library");
		const wanted = titles.slice(0, 2).map((title) => title.anilistId);
		expect(exported.watchlist.map((entry) => entry.anilist_id).toSorted((a, b) => a - b)).toEqual(
			wanted.toSorted((a, b) => a - b),
		);
		expect(exported.history).toHaveLength(1);
	});

	test("marks every released episode of a completed MyAnimeList title and reports unknown ones", async () => {
		const third = titles.at(2);
		const xml = `<myanimelist>
			<anime><series_animedb_id>${third?.malId}</series_animedb_id><series_title>Third</series_title><my_status>Completed</my_status><my_watched_episodes>0</my_watched_episodes></anime>
			<anime><series_animedb_id>999999999</series_animedb_id><series_title>Not held</series_title><my_status>Watching</my_status><my_watched_episodes>2</my_watched_episodes></anime>
		</myanimelist>`;
		const report = await importLibrary(profile, { source: "myanimelist", xml });

		expect(report.watchlist_added).toBe(1);
		expect(report.episodes_added).toBe(third?.released ?? -1);
		expect(report.not_in_sora_count).toBe(1);
		expect(report.not_in_sora[0]).toEqual({ anilist_id: null, title: "Not held" });
	});

	test("rejects an import that is not valid", async () => {
		await expect(importLibrary(profile, { source: "anilist", username: "" })).rejects.toThrow();
	});
});
