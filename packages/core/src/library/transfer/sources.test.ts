import { describe, expect, test } from "bun:test";

import { fromDayText, listDates, parseMalExport } from "./sources";

/** One `<anime>` element of an export, with `fields` as its children. */
class Anime {
	readonly #fields: Record<string, string>;

	constructor(fields: Record<string, string>) {
		this.#fields = fields;
	}

	get xml(): string {
		const children = Object.entries(this.#fields)
			.map(([name, value]) => `<${name}>${value}</${name}>`)
			.join("");

		return `<anime>${children}</anime>`;
	}
}

describe("parseMalExport", () => {
	test("reads the id, title, status and progress of each title", () => {
		const xml = `<?xml version="1.0"?><myanimelist><myinfo><user_export_type>1</user_export_type></myinfo>${
			new Anime({
				my_status: "Watching",
				my_watched_episodes: "7",
				series_animedb_id: "5114",
				series_title: "<![CDATA[Fullmetal Alchemist: Brotherhood]]>",
			}).xml
		}${
			new Anime({
				my_status: "Plan to Watch",
				my_watched_episodes: "0",
				series_animedb_id: "9253",
				series_title: "Steins;Gate",
			}).xml
		}</myanimelist>`;

		expect(parseMalExport(xml)).toEqual([
			{
				addedAt: null,
				changedAt: null,
				malId: 5114,
				status: "watching",
				through: 7,
				title: "Fullmetal Alchemist: Brotherhood",
			},
			{
				addedAt: null,
				changedAt: null,
				malId: 9253,
				status: "plan_to_watch",
				through: 0,
				title: "Steins;Gate",
			},
		]);
	});

	test("marks a completed title as watched through every episode", () => {
		const [completed] = parseMalExport(
			new Anime({
				my_status: "Completed",
				my_watched_episodes: "12",
				series_animedb_id: "1",
				series_title: "A",
			}).xml,
		);

		expect(completed?.status).toBe("completed");
		expect(completed?.through).toBeNull();
	});

	test("counts on-hold as watching and reads numeric statuses", () => {
		const statuses = parseMalExport(
			[
				new Anime({
					my_status: "On-Hold",
					my_watched_episodes: "3",
					series_animedb_id: "1",
					series_title: "A",
				}).xml,
				new Anime({
					my_status: "4",
					my_watched_episodes: "1",
					series_animedb_id: "2",
					series_title: "B",
				}).xml,
			].join(""),
		).map((row) => row.status);

		expect(statuses).toEqual(["watching", "dropped"]);
	});

	test("leaves out a title without an id or with a status it does not know", () => {
		const xml = [
			new Anime({
				my_status: "Watching",
				series_title: "No id",
			}).xml,
			new Anime({
				my_status: "Mystery",
				series_animedb_id: "7",
				series_title: "Odd status",
			}).xml,
		].join("");

		expect(parseMalExport(xml)).toEqual([]);
	});

	test("ignores a manga list", () => {
		expect(
			parseMalExport(
				"<myanimelist><manga><manga_mangadb_id>1</manga_mangadb_id></manga></myanimelist>",
			),
		).toEqual([]);
	});
});

describe("MyAnimeList export dates", () => {
	test("reads when a title was started and finished", () => {
		const [watched] = parseMalExport(
			new Anime({
				my_finish_date: "2020-03-09",
				my_start_date: "2020-02-01",
				my_status: "Completed",
				my_watched_episodes: "12",
				series_animedb_id: "1",
				series_title: "A",
			}).xml,
		);

		expect(watched?.addedAt).toEqual(new Date("2020-02-01T00:00:00Z"));
		expect(watched?.changedAt).toEqual(new Date("2020-03-09T00:00:00Z"));
	});

	test("treats MyAnimeList's all-zero date as no date", () => {
		const [watched] = parseMalExport(
			new Anime({
				my_finish_date: "0000-00-00",
				my_start_date: "0000-00-00",
				my_status: "Watching",
				my_watched_episodes: "1",
				series_animedb_id: "1",
				series_title: "A",
			}).xml,
		);

		expect(watched?.addedAt).toBeNull();
		expect(watched?.changedAt).toBeNull();
	});
});

describe("fromDayText", () => {
	test("fills a missing month or day with the first", () => {
		expect(fromDayText("2020")).toEqual(new Date("2020-01-01T00:00:00Z"));
		expect(fromDayText("2020-05")).toEqual(new Date("2020-05-01T00:00:00Z"));
		expect(fromDayText("2020-05-00")).toEqual(new Date("2020-05-01T00:00:00Z"));
	});

	test("returns nothing for no date", () => {
		expect(fromDayText("0000-00-00")).toBeNull();
		expect(fromDayText("")).toBeNull();
		expect(fromDayText(null)).toBeNull();
		expect(fromDayText("soon")).toBeNull();
	});
});

describe("listDates", () => {
	const created = new Date("2021-01-01T00:00:00Z");
	const started = new Date("2021-02-01T00:00:00Z");
	const updated = new Date("2021-06-01T00:00:00Z");

	test("adds at creation, else the first date there is, and changes at the latest", () => {
		expect(
			listDates({
				created,
				started,
				updated,
			}),
		).toEqual({
			addedAt: created,
			changedAt: updated,
		});
		expect(
			listDates({
				started,
				updated,
			}),
		).toEqual({
			addedAt: started,
			changedAt: updated,
		});
		expect(listDates({ updated })).toEqual({
			addedAt: updated,
			changedAt: updated,
		});
	});

	test("has neither date when the list gives none", () => {
		expect(
			listDates({
				created: null,
				updated: null,
			}),
		).toEqual({
			addedAt: null,
			changedAt: null,
		});
	});
});
