import { beforeAll, describe, expect, test } from "bun:test";

import { day } from "@sora/shared";
import { and, eq } from "drizzle-orm";

import { db } from "../../database/client";
import { anime } from "../../database/schema/catalog";
import { seriesState } from "../../database/schema/library";
import { series, seriesEpisode } from "../../database/schema/series";
import type { LibraryExport } from "../../models/transfer";
import { exportLibrary, importLibrary, undoImport } from "./transfer";

/** When a profile's titles were added and last changed, by series ID. */
class Dates {
	readonly #rows: Map<
		string,
		{
			addedAt: Date | null;
			changedAt: Date | null;
		}
	>;

	constructor(
		rows: Map<
			string,
			{
				addedAt: Date | null;
				changedAt: Date | null;
			}
		>,
	) {
		this.#rows = rows;
	}

	static async of(userId: string): Promise<Dates> {
		const rows = await db
			.select({
				addedAt: seriesState.addedAt,
				changedAt: seriesState.statusChangedAt,
				seriesId: seriesState.seriesId,
			})
			.from(seriesState)
			.where(eq(seriesState.userId, userId));

		return new Dates(new Map(rows.map((row) => [row.seriesId, row])));
	}

	iso(title: { seriesId: string } | undefined, field: "addedAt" | "changedAt") {
		return this.#rows.get(title?.seriesId ?? "")?.[field]?.toISOString();
	}
}

interface Title {
	anilistId: number;
	malId: number;
	released: number;
	seriesId: string;
}

describe("library import and export", () => {
	const profile = `transfer-test-${crypto.randomUUID()}`;
	const now = new Date();
	const firstAnilistId = 2_000_000_000 + Math.floor(Math.random() * 100_000_000);
	const firstMalId = 900_000_000 + Math.floor(Math.random() * 90_000_000);

	const titles: Title[] = [3, 4, 5].map((released, index) => ({
		anilistId: firstAnilistId + index,
		malId: firstMalId + index,
		released,
		seriesId: `${profile}-${index}`,
	}));

	beforeAll(async () => {
		await db.insert(anime).values(
			titles.map((title) => ({
				anilistId: title.anilistId,
				media: {
					averageScore: null,
					bannerImage: null,
					countryOfOrigin: null,
					coverImage: null,
					description: null,
					duration: null,
					endDate: null,
					episodes: title.released,
					format: "TV" as const,
					genres: [],
					id: title.anilistId,
					idMal: title.malId,
					isAdult: false,
					nextAiringEpisode: null,
					popularity: null,
					recommendations: null,
					relations: null,
					season: null,
					seasonYear: null,
					source: null,
					staff: null,
					startDate: null,
					status: "FINISHED" as const,
					studios: null,
					synonyms: [],
					tags: [],
					title: {
						english: `Transfer test ${title.anilistId}`,
						native: null,
						romaji: null,
					},
				},
				refreshedAt: now,
			})),
		);
		await db.insert(series).values(
			titles.map((title) => ({
				anilistId: title.anilistId,
				id: title.seriesId,
				key: `anilist:${title.anilistId}`,
				kind: "standalone" as const,
				laidOutAt: now,
				status: "FINISHED" as const,
				title: `Transfer test ${title.anilistId}`,
			})),
		);
		await db.insert(seriesEpisode).values(
			titles.flatMap((title) =>
				Array.from(
					{
						length: title.released,
					},
					(_, index) => ({
						airedAt: new Date(now.getTime() - (title.released - index) * day),
						number: index + 1,
						seriesId: title.seriesId,
					}),
				),
			),
		);
	});

	const file = (history: boolean) => {
		const played: LibraryExport["history"] = [];

		if (history) {
			played.push({
				anilist_id: titles[0]?.anilistId ?? 0,
				duration_seconds: 1400,
				episode: 1,
				finished: true,
				position_seconds: 1400,
				rewatch: false,
				watched_at: now.toISOString(),
			});
		}

		return {
			document: {
				exported_at: now.toISOString(),
				format: "sora-library" as const,
				history: played,
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
		};
	};

	test("adds a file's watchlist and history", async () => {
		const report = await importLibrary(profile, file(true));

		expect(report.watchlist_added).toBe(2);
		expect(report.episodes_added).toBe(1);
		expect(report.not_in_sora_count).toBe(0);
	});

	test("changes nothing when the same file is imported again", async () => {
		await importLibrary(profile, file(true));
		const report = await importLibrary(profile, file(true));

		expect(report.watchlist_added).toBe(0);
		expect(report.watchlist_kept).toBe(2);
		expect(report.episodes_added).toBe(0);
	});

	test("keeps the status a title already has", async () => {
		await importLibrary(profile, file(true));
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
		await importLibrary(profile, file(true));
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

		const report = await importLibrary(profile, {
			source: "myanimelist",
			xml,
		});

		expect(report.watchlist_added).toBe(1);
		expect(report.episodes_added).toBe(third?.released ?? -1);
		expect(report.not_in_sora_count).toBe(1);
		expect(report.not_in_sora[0]).toEqual({
			anilist_id: null,
			title: "Not held",
		});
	});

	test("keeps the dates a list gives instead of the time of the import", async () => {
		const dated = `transfer-test-${crypto.randomUUID()}`;

		const [first, second, third] = titles;

		const xml = `<myanimelist>
			<anime><series_animedb_id>${first?.malId}</series_animedb_id><my_status>Completed</my_status><my_watched_episodes>0</my_watched_episodes><my_start_date>2019-03-04</my_start_date><my_finish_date>2019-04-01</my_finish_date></anime>
			<anime><series_animedb_id>${second?.malId}</series_animedb_id><my_status>Watching</my_status><my_watched_episodes>1</my_watched_episodes><my_start_date>2021-00-00</my_start_date><my_finish_date>0000-00-00</my_finish_date></anime>
			<anime><series_animedb_id>${third?.malId}</series_animedb_id><my_status>Plan to Watch</my_status><my_watched_episodes>0</my_watched_episodes><my_start_date>2999-01-01</my_start_date><my_finish_date>0000-00-00</my_finish_date></anime>
		</myanimelist>`;

		const before = new Date();
		await importLibrary(dated, {
			source: "myanimelist",
			xml,
		});
		const byId = await Dates.of(dated);

		expect(byId.iso(first, "addedAt")).toBe("2019-03-04T00:00:00.000Z");
		expect(byId.iso(first, "changedAt")).toBe("2019-04-01T00:00:00.000Z");
		expect(byId.iso(second, "addedAt")).toBe("2021-01-01T00:00:00.000Z");
		const future = new Date(byId.iso(third, "addedAt") ?? 0).getTime();
		expect(future).toBeGreaterThanOrEqual(before.getTime());
		expect(future).toBeLessThanOrEqual(Date.now());
	});

	test("round trips when each title's status last changed", async () => {
		await importLibrary(profile, file(true));
		const [title] = titles;
		const changed = new Date("2024-02-03T04:05:06.000Z");
		await db
			.update(seriesState)
			.set({ statusChangedAt: changed })
			.where(and(eq(seriesState.userId, profile), eq(seriesState.seriesId, title?.seriesId ?? "")));
		const exported = await exportLibrary(profile);
		expect(
			exported.watchlist.find((entry) => entry.anilist_id === title?.anilistId)?.changed_at,
		).toBe(changed.toISOString());

		const other = `transfer-test-${crypto.randomUUID()}`;

		await importLibrary(other, {
			document: exported,
			source: "sora",
		});

		const [row] = await db
			.select({ changedAt: seriesState.statusChangedAt })
			.from(seriesState)
			.where(and(eq(seriesState.userId, other), eq(seriesState.seriesId, title?.seriesId ?? "")));

		expect(row?.changedAt?.toISOString()).toBe(changed.toISOString());
	});

	test("rejects an import that is not valid", async () => {
		await expect(
			importLibrary(profile, {
				source: "anilist",
				username: "",
			}),
		).rejects.toThrow();
	});

	test("undoes the latest import, once", async () => {
		const other = `${profile}-undo`;

		const report = await importLibrary(other, file(true));
		expect(report.import_id).not.toBeNull();

		expect(await undoImport(other, "someone-elses")).toEqual({
			episodes_removed: 0,
			watchlist_removed: 0,
		});
		expect(await undoImport(other, report.import_id ?? "")).toEqual({
			episodes_removed: 1,
			watchlist_removed: 2,
		});
		const remaining = await exportLibrary(other);
		expect(remaining.watchlist).toHaveLength(0);
		expect(await undoImport(other, report.import_id ?? "")).toEqual({
			episodes_removed: 0,
			watchlist_removed: 0,
		});
	});
});
