import { describe, expect, test } from "bun:test";

import { nextEpisodeAddress, storyContinuation } from "./series-navigation";

const series = {
	id: "season-1",
	episode_count: 26,
	seasons: [
		{ series_id: "season-1", next_series_id: "season-2", episode_count: 26, format: "TV" },
		{ series_id: "season-2", next_series_id: null, episode_count: 24, format: "TV" },
	] satisfies Parameters<typeof storyContinuation>[0]["seasons"],
};

describe("story playback navigation", () => {
	test("continues into the next season at the finale", () => {
		expect(nextEpisodeAddress(series, 26, null)).toEqual({ seriesId: "season-2", episode: "1" });
	});

	test("prefers the provider's next episode and stops at a listing gap", () => {
		expect(nextEpisodeAddress(series, 25, 26)).toEqual({ seriesId: "season-1", episode: "26" });
		expect(nextEpisodeAddress(series, 25, null)).toBeUndefined();
	});

	test("does not infer a sequel from the next dropdown option", () => {
		const unconfirmed = {
			...series,
			seasons: series.seasons.map((part) => ({ ...part, next_series_id: null })),
		};
		expect(nextEpisodeAddress(unconfirmed, 26, null)).toBeUndefined();
	});

	test("does not skip unavailable story entries", () => {
		const upcoming = {
			...series,
			seasons: series.seasons.map((part) => ({
				...part,
				episode_count: part.series_id === "season-2" ? 0 : 26,
			})),
		};
		expect(nextEpisodeAddress(upcoming, 26, null)).toBeUndefined();
	});

	test("a side story outside the season picker cannot enter the main path", () => {
		expect(
			nextEpisodeAddress({ ...series, id: "side-story", episode_count: 4 }, 4, null),
		).toBeUndefined();
	});
});
