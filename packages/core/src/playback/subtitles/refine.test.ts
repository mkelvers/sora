import { describe, expect, test } from "bun:test";

import { defined } from "@sora/shared";

import { refineCues } from "./refine";
import type { SpokenWord } from "./refine";
import type { Cue } from "./vtt";

/** Distinct made-up words, so a line never shares one with another by accident. */
const vocabulary = (line: number) =>
	Array.from({ length: 5 }, (_, index) => `zq${line * 7 + index}x`);

/** A script of one cue every five seconds, three seconds long. */
const script = (lines: number): Cue[] =>
	Array.from({ length: lines }, (_, line) => ({
		end: line * 5 + 3,
		start: line * 5,
		text: vocabulary(line).join(" "),
	}));

/** The dub saying each line of `cues`, `offset` seconds later and for `seconds`, word by word. */
const speech = (
	cues: Cue[],
	offset: number,
	seconds = 1.5,
	skipping: number[] = [],
): SpokenWord[] =>
	cues.flatMap((cue, line) => {
		if (skipping.includes(line)) {
			return [];
		}

		const words = cue.text.split(" ");
		return words.map((text, index) => ({
			end: cue.start + offset + ((index + 1) * seconds) / words.length,
			start: cue.start + offset + (index * seconds) / words.length,
			text,
		}));
	});

describe("refineCues", () => {
	test("moves each cue to when its words are spoken, with a little lead and tail", () => {
		const cues = script(30);
		const refinement = refineCues(cues, speech(cues, 10.4), null);

		expect(refinement?.anchors).toHaveLength(30);
		const [first, second] = defined(refinement).anchors;
		expect(first?.movedStart).toBeCloseTo(10.4 - 0.15, 2);
		expect(first?.movedEnd).toBeCloseTo(10.4 + 1.5 + 0.25, 2);
		expect(second?.movedStart).toBeCloseTo(5 + 10.4 - 0.15, 2);
	});

	test("finds the offset between the timelines without being told it", () => {
		const cues = script(30);
		const refinement = refineCues(cues, speech(cues, -61.04), null);

		expect(refinement?.shifts).toHaveLength(1);
		expect(refinement?.shifts[0]?.offset).toBeCloseTo(-61.04 - 0.1, 0);
	});

	test("shortens a cue that stays up long after its line is spoken", () => {
		const cues = script(30).map((cue) => ({
			...cue,
			end: cue.start + 4.8,
		}));
		const refinement = refineCues(cues, speech(cues, 0.3, 1.2), null);

		const [anchor] = defined(refinement).anchors;
		expect(defined(anchor).movedEnd - defined(anchor).movedStart).toBeLessThan(2);
		expect(defined(anchor).end - defined(anchor).start).toBeCloseTo(4.8, 5);
	});

	test("leaves a cue nobody says, such as a sign, to the offset", () => {
		const cues = script(30);
		cues[10] = {
			end: 53,
			start: 50,
			text: "Hidden Inventory",
		};
		const refinement = refineCues(cues, speech(cues, 2, 1.5, [10]), null);

		expect(refinement?.anchors).toHaveLength(29);
		expect(refinement?.anchors.some((anchor) => anchor.start === 50)).toBe(false);
	});

	test("follows an offset that changes where the dub adds footage", () => {
		const cues = script(40);
		const words = [...speech(cues.slice(0, 20), 8), ...speech(cues.slice(20), 10)];
		const refinement = refineCues(cues, words, null);

		expect(refinement?.shifts.map((shift) => Math.round(shift.offset))).toEqual([8, 10]);
		expect(refinement?.shifts[1]?.from).toBeCloseTo(100, 0);
	});

	test("keeps the picture's offset when the speech agrees with it", () => {
		const cues = script(30);
		const refinement = refineCues(cues, speech(cues, 7.2), [
			{
				from: 0,
				offset: 7.01,
			},
		]);

		expect(refinement?.shifts).toEqual([
			{
				from: 0,
				offset: 7.01,
			},
		]);
	});

	test("matches words a recognizer misheard by a letter, as in a character's name", () => {
		const cues = script(30).map((cue) => ({
			...cue,
			text: `${cue.text} Frieren`,
		}));
		const words = speech(cues, 3).map((word) => ({
			...word,
			text: word.text === "Frieren" ? "Freeran." : word.text,
		}));

		expect(refineCues(cues, words, null)?.anchors).toHaveLength(30);
	});

	test("does not move cues past one another", () => {
		const cues = script(30);
		const refinement = refineCues(cues, speech(cues, 1, 4.5), null);

		for (const [index, anchor] of defined(refinement).anchors.entries()) {
			const next = defined(refinement).anchors[index + 1];
			if (next) {
				expect(anchor.movedEnd).toBeLessThanOrEqual(next.movedStart);
			}
		}
	});

	test("leaves cues that show together in the sub showing together", () => {
		const cues = script(30);
		cues.splice(5, 0, { ...defined(cues[5]) });
		const refinement = refineCues(cues, speech(cues, 1), null);

		const [first, second] = defined(refinement).anchors.filter((anchor) => anchor.start === 25);
		expect(defined(first).movedEnd - defined(first).movedStart).toBeGreaterThan(1.5);
		expect(defined(second).movedStart).toBeCloseTo(defined(first).movedStart, 5);
	});

	test("places a cue by when it is said when the dub words it differently", () => {
		const cues = script(30);
		const words = speech(cues, 2);
		const reworded = cues.map((cue, line) => (line === 10 ? { ...cue, text: "qqa qqb qqc" } : cue));
		const refinement = refineCues(reworded, words, null);

		const anchor = defined(refinement).anchors.find((candidate) => candidate.start === 50);
		expect(anchor?.movedStart).toBeCloseTo(52 - 0.15, 1);
	});

	test("gives up when the dub does not speak the sub's script", () => {
		const cues = script(30);
		const other = script(30).map((cue) => ({
			...cue,
			text: cue.text.replaceAll("zq", "yv"),
		}));

		expect(refineCues(cues, speech(other, 2), null)).toBeNull();
	});

	test("gives up when only a few lines match", () => {
		const cues = script(30);

		expect(refineCues(cues, speech(cues.slice(0, 3), 2), null)).toBeNull();
	});
});
