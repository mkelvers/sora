import { describe, expect, test } from "bun:test";

import { judgeSongs } from "./detect";
import type { FoundSong } from "./detect";

const found = (
	kind: FoundSong["kind"],
	start: number,
	end: number,
	coverage = 1,
	clipped = false,
): FoundSong => ({
	clipped,
	coverage,
	end,
	kind,
	start,
});

describe("judgeSongs", () => {
	test("takes where the opening and ending songs play", () => {
		expect(
			judgeSongs([found("opening", 58.3, 147.9), found("ending", 1330.2, 1420)], 1430),
		).toEqual({
			ending: {
				end: 1420,
				start: 1330.2,
			},
			opening: {
				end: 147.9,
				start: 58.3,
			},
		});
	});

	test("ignores a snippet of a song, which plays as background music", () => {
		// Skeleton Knight episode 12: 63% of the opening plays over a fight.
		expect(judgeSongs([found("opening", 791.8, 874.7, 0.63)], 1430)).toEqual({
			ending: null,
			opening: null,
		});
	});

	test("gives no opening when the opening song plays only late, with the ending after it", () => {
		// JUJUTSU KAISEN Season 3 episode 12: the opening plays over the final fight.
		expect(
			judgeSongs([found("opening", 1283.8, 1373.5), found("ending", 1621.3, 1710.7)], 1712),
		).toEqual({
			ending: {
				end: 1710.7,
				start: 1621.3,
			},
			opening: "none",
		});
	});

	test("takes an opening song that closes an episode with no ending as its ending", () => {
		// Dr. STONE episode 1 ends on its opening.
		expect(judgeSongs([found("opening", 1341.2, 1431.1)], 1447)).toEqual({
			ending: {
				end: 1431.1,
				start: 1341.2,
			},
			opening: "none",
		});
	});

	test("takes the opening at its first whole play, not a fuller repeat over the climax", () => {
		const judged = judgeSongs(
			[
				found("opening", 1140, 1230, 1),
				found("opening", 90, 180, 0.9),
				found("ending", 1330, 1420),
			],
			1430,
		);

		expect(judged.opening).toEqual({
			end: 180,
			start: 90,
		});
	});

	test("prefers a song read whole to one cut off at the edge of what was read", () => {
		const judged = judgeSongs(
			[found("opening", 280, 362, 0.91, true), found("opening", 280, 370, 1)],
			1430,
		);

		expect(judged.opening).toEqual({
			end: 370,
			start: 280,
		});
	});

	test("takes the most complete match when a kind is found more than once", () => {
		expect(
			judgeSongs([found("ending", 1311, 1400, 0.85), found("ending", 1287, 1377, 1)], 1430).ending,
		).toEqual({
			end: 1377,
			start: 1287,
		});
	});
});
