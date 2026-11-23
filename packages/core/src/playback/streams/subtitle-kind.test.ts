import { describe, expect, test } from "bun:test";

import { classifySubtitle, subtitleKind, subtitleStats } from "./subtitle-kind";

/** A WebVTT track of `count` cues, one every `seconds` and each two seconds long. */
class Track {
	readonly #seconds: number;
	readonly #count: number;
	readonly #text: (index: number) => string;

	constructor(seconds: number, count: number, text: (index: number) => string) {
		this.#seconds = seconds;
		this.#count = count;
		this.#text = text;
	}

	get content() {
		const cues = Array.from({ length: this.#count }, (_, index) => {
			const start = index * this.#seconds;

			const [from, to] = [start, start + 2].map(
				(seconds) =>
					`${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}.000`,
			);

			return `${from} --> ${to}\n${this.#text(index)}`;
		});

		return ["WEBVTT", ...cues].join("\n\n");
	}
}

const dialogue = new Track(4, 360, (index) => `Line ${index}`).content;
const signs = new Track(90, 14, (index) => `<b>Title ${index}</b>`).content;

const captions = new Track(4, 360, (index) => {
	if (index % 6 === 0) {
		return `<b>[door ${index}]</b>`;
	}

	return `Line ${index}`;
}).content;

describe("classifySubtitle", () => {
	test("recognizes steady speech as dialogue", () => {
		expect(classifySubtitle(dialogue)).toBe("dialogue");
	});

	test("recognizes a few on-screen texts over a whole episode as signs", () => {
		expect(classifySubtitle(signs)).toBe("signs");
	});

	test("recognizes sound descriptions and music notes as captions", () => {
		expect(classifySubtitle(captions)).toBe("captions");
		expect(
			classifySubtitle(
				new Track(4, 360, (index) => {
					if (index % 4 === 0) {
						return "♪";
					}

					return "Line";
				}).content,
			),
		).toBe("captions");
	});

	test("does not guess for what sits between the kinds", () => {
		expect(classifySubtitle(new Track(20, 75, (index) => `Lyric ${index}`).content)).toBeNull();
		expect(
			classifySubtitle(
				new Track(4, 360, (index) => {
					if (index % 25 === 0) {
						return "[laughs]";
					}

					return "Line";
				}).content,
			),
		).toBeNull();
	});

	test("does not judge a track too short to compare", () => {
		expect(classifySubtitle(new Track(2, 20, () => "Line").content)).toBeNull();
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
		expect(subtitleKind("English (English Signs [CR])", new Track(20, 75, () => "x").content)).toBe(
			"signs",
		);
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
