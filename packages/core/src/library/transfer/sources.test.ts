import { describe, expect, test } from "bun:test";

import { parseMyAnimeListExport } from "./sources";

const entry = (fields: Record<string, string>) =>
	`<anime>${Object.entries(fields)
		.map(([name, value]) => `<${name}>${value}</${name}>`)
		.join("")}</anime>`;

describe("parseMyAnimeListExport", () => {
	test("reads the id, title, status and progress of each title", () => {
		const xml = `<?xml version="1.0"?><myanimelist><myinfo><user_export_type>1</user_export_type></myinfo>${entry(
			{
				my_status: "Watching",
				my_watched_episodes: "7",
				series_animedb_id: "5114",
				series_title: "<![CDATA[Fullmetal Alchemist: Brotherhood]]>",
			},
		)}${entry({
			my_status: "Plan to Watch",
			my_watched_episodes: "0",
			series_animedb_id: "9253",
			series_title: "Steins;Gate",
		})}</myanimelist>`;

		expect(parseMyAnimeListExport(xml)).toEqual([
			{
				malId: 5114,
				status: "watching",
				through: 7,
				title: "Fullmetal Alchemist: Brotherhood",
			},
			{
				malId: 9253,
				status: "plan_to_watch",
				through: 0,
				title: "Steins;Gate",
			},
		]);
	});

	test("marks a completed title as watched through every episode", () => {
		const [completed] = parseMyAnimeListExport(
			entry({
				my_status: "Completed",
				my_watched_episodes: "12",
				series_animedb_id: "1",
				series_title: "A",
			}),
		);

		expect(completed?.status).toBe("completed");
		expect(completed?.through).toBeNull();
	});

	test("counts on-hold as watching and reads numeric statuses", () => {
		const statuses = parseMyAnimeListExport(
			[
				entry({
					my_status: "On-Hold",
					my_watched_episodes: "3",
					series_animedb_id: "1",
					series_title: "A",
				}),
				entry({
					my_status: "4",
					my_watched_episodes: "1",
					series_animedb_id: "2",
					series_title: "B",
				}),
			].join(""),
		).map((row) => row.status);

		expect(statuses).toEqual(["watching", "dropped"]);
	});

	test("leaves out a title without an id or with a status it does not know", () => {
		const xml = [
			entry({ my_status: "Watching", series_title: "No id" }),
			entry({ my_status: "Mystery", series_animedb_id: "7", series_title: "Odd status" }),
		].join("");

		expect(parseMyAnimeListExport(xml)).toEqual([]);
	});

	test("ignores a manga list", () => {
		expect(
			parseMyAnimeListExport(
				"<myanimelist><manga><manga_mangadb_id>1</manga_mangadb_id></manga></myanimelist>",
			),
		).toEqual([]);
	});
});
