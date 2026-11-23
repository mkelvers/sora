import type { FoundSong } from "./detect";

/** A song found in a video from `start` to `end` seconds. */
export const found = (
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
