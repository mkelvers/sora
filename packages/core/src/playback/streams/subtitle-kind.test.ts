import { describe, expect, test } from "bun:test";

import { classifySubtitle, subtitleKind, subtitleStats } from "./subtitle-kind";

function track(cues: { start: number; text: string }[]) {
	const stamp = (seconds: number) => {
		const minutes = Math.floor(seconds / 60);
		return `${String(minutes).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.000`;
	};

	return [
		"WEBVTT",
		...cues.map((cue) => `${stamp(cue.start)} --> ${stamp(cue.start + 2)}\n${cue.text}`),
	].join("\n\n");
}

function every(seconds: number, count: number, text: (index: number) => string) {
	return track(
		Array.from({ length: count }, (_, index) => ({
			start: index * seconds,
			text: text(index),
		})),
	);
}

const dialogue = every(4, 360, (index) => `Line ${index}`);
const signs = every(90, 14, (index) => `<b>Title ${index}</b>`);
const captions = every(4, 360, (index) =>
	index % 6 === 0 ? `<b>[door ${index}]</b>` : `Line ${index}`,
);

describe("classifySubtitle", () => {
	test("recognizes steady speech as dialogue", () => {
		expect(classifySubtitle(dialogue)).toBe("dialogue");
	});

	test("recognizes a few on-screen texts over a whole episode as signs", () => {
		expect(classifySubtitle(signs)).toBe("signs");
	});

	test("recognizes sound descriptions and music notes as captions", () => {
		expect(classifySubtitle(captions)).toBe("captions");
		expect(classifySubtitle(every(4, 360, (index) => (index % 4 === 0 ? "♪" : "Line")))).toBe(
			"captions",
		);
	});

	test("does not guess for what sits between the kinds", () => {
		expect(classifySubtitle(every(20, 75, (index) => `Lyric ${index}`))).toBeNull();
		expect(
			classifySubtitle(every(4, 360, (index) => (index % 25 === 0 ? "[laughs]" : "Line"))),
		).toBeNull();
	});

	test("does not judge a track too short to compare", () => {
		expect(classifySubtitle(every(2, 20, () => "Line"))).toBeNull();
		expect(classifySubtitle("WEBVTT")).toBeNull();
	});
});

describe("subtitleStats", () => {
	test("counts cues and sound-only cues, ignoring markup", () => {
		const stats = subtitleStats(captions);
		expect(stats?.cues).toBe(360);
		expect(stats?.soundShare).toBeCloseTo(1 / 6, 2);
	});
});

describe("subtitleKind", () => {
	test("trusts a label that names the kind when the cues agree or are unclear", () => {
		expect(subtitleKind("English (English Signs [CR])", signs)).toBe("signs");
		expect(
			subtitleKind(
				"English (English Signs [CR])",
				every(20, 75, () => "x"),
			),
		).toBe("signs");
		expect(subtitleKind("English (English Closed Captions [CR])", captions)).toBe("captions");
		expect(subtitleKind("German (German - (Forced))", null)).toBe("signs");
	});

	test("gives no kind when the cues contradict the label", () => {
		expect(subtitleKind("English Signs", dialogue)).toBeNull();
		expect(subtitleKind("English Closed Captions", signs)).toBeNull();
	});

	test("falls back to the cues when the label says nothing", () => {
		expect(subtitleKind("English", dialogue)).toBe("dialogue");
		expect(subtitleKind("English 2", captions)).toBe("captions");
		expect(subtitleKind("English", null)).toBeNull();
	});
});
