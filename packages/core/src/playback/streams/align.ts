import { defined } from "@sora/shared";

import { Boundaries } from "./boundaries";

/**
 * From a point on one timeline on, how far the same picture sits on another,
 * in seconds.
 */
export interface TimelineShift {
	from: number;
	offset: number;
}

/**
 * The candidate per row that matches most rows overall, paying `switchPenalty`
 * per change (Viterbi). By default an offset must win 6 matches to be worth
 * switching to, so stray matches cannot.
 */
export const bestPath = (matches: boolean[][], switchPenalty = 6) => {
	let scores = defined(matches[0]).map(Number);
	const cameFrom: number[][] = [];

	for (const row of matches.slice(1)) {
		const leader = scores.indexOf(Math.max(...scores));
		const switched = defined(scores[leader]) - switchPenalty;
		cameFrom.push(
			scores.map((stay, choice) => {
				if (stay >= switched) {
					return choice;
				}

				return leader;
			}),
		);
		scores = scores.map((stay, choice) => Math.max(stay, switched) + Number(row[choice]));
	}

	const path = [scores.indexOf(Math.max(...scores))];

	for (const step of cameFrom.toReversed()) {
		path.unshift(defined(step[defined(path[0])]));
	}

	return path;
};

/**
 * Maps one encode's timeline onto another's, such as a sub's onto its dub's,
 * from their HLS segment boundaries.
 *
 * Segments are cut at keyframes, and encoders put keyframes at scene cuts, so
 * two encodes of the same picture share most boundaries, shifted by however
 * much footage one adds or cuts before them. The shift can change along the
 * episode, such as after a dub's shorter opening, so it is found piecewise:
 * every offset that many boundaries agree on is a candidate, and each
 * boundary takes the candidate that matches, changing only where enough
 * boundaries agree it should.
 *
 * @param source - Segment start times of the encode to map from, ascending.
 * @param target - Segment start times of the encode to map onto, ascending.
 * @returns The shifts in order of `from`, or `null` when too few boundaries
 *   match for the encodes to be the same picture.
 */
export const align = (source: number[], target: number[]): TimelineShift[] | null => {
	/** Below this share of matching boundaries, the encodes are not the same episode. */
	const minimumMatched = 0.5;

	if (source.length === 0 || target.length === 0) {
		return null;
	}

	const boundaries = new Boundaries(target);
	const offsets = boundaries.offsets(source);

	if (offsets.length === 0) {
		return null;
	}

	const matches = source.map((time) => offsets.map((offset) => boundaries.matches(time, offset)));

	const path = bestPath(matches);

	const matched = path.filter((choice, index) => matches[index]?.[choice]).length;

	if (matched / source.length < minimumMatched) {
		return null;
	}

	const shifts: TimelineShift[] = [];

	for (const [index, choice] of path.entries()) {
		const offset = defined(offsets[choice]);

		if (shifts.at(-1)?.offset === offset) {
			continue;
		}

		let from = 0;

		if (index !== 0) {
			from = defined(source[index]);
		}

		shifts.push({
			from,
			offset,
		});
	}

	return shifts;
};

/** Where a time on the source timeline lands on the target's. */
export const shiftTime = (shifts: TimelineShift[], time: number) => {
	const shift = shifts.findLast((candidate) => candidate.from <= time) ?? shifts[0];

	if (shift) {
		return time + shift.offset;
	}

	return time;
};
