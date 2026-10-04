import { describe, expect, test } from "bun:test";

import { fuzzyDate, placeholder, plainText, synopsis } from "./text";

describe("plainText", () => {
	test("converts line breaks, strips tags, and decodes entities", () => {
		expect(plainText("A <i>quiet</i> journey.<br><br>Frieren &amp; Fern&#39;s story.")).toBe(
			"A quiet journey.\n\nFrieren & Fern's story.",
		);
	});

	test("removes a trailing source attribution", () => {
		expect(plainText("An elf mage outlives her party.\n\n(Source: Crunchyroll)")).toBe(
			"An elf mage outlives her party.",
		);
	});

	test("keeps parenthetical text that is not an attribution", () => {
		expect(plainText("Season two (final part)")).toBe("Season two (final part)");
	});
});

describe("synopsis", () => {
	test("keeps a text that already fits", () => {
		const text =
			"Corporate worker Mikami Satoru is stabbed by a random killer, and is reborn to an alternate world. But he turns out to be reborn a slime!";
		expect(synopsis(text)).toBe(text);
	});

	test("keeps the opening sentences that fit and drops the rest", () => {
		expect(
			synopsis(
				"Six months have passed since the polar opposite classmates Miyu Suzuki and Yuusuke Tani started dating. Through spending time together along with their friends from school, the two have been happier than ever. As the year nears its end, the new couple plans to celebrate Christmas and the New Year together, making memories for years to come.<br>\n<br>\nMeanwhile, Miyu and Yuusuke's friends Shuuji Taira and Kentarou Yamada are puzzled by their own situations.<br>\n<br>\n(Source: MAL Rewrite)",
			),
		).toBe(
			"Six months have passed since the polar opposite classmates Miyu Suzuki and Yuusuke Tani started dating. Through spending time together along with their friends from school, the two have been happier than ever.",
		);
	});

	test("drops part labels and everything after the source", () => {
		expect(
			synopsis(
				"<strong>OVA 1:</strong><br>\nRimuru holds a sumo tournament.<br>\n<br>\n(Source: Crunchyroll)<br>\n<br>\n<i>Note: Bundled with the 12th manga volume.</i>",
			),
		).toBe("Rimuru holds a sumo tournament.");
	});

	test("drops a leading note and a sentence that only names the release", () => {
		expect(
			synopsis(
				"<i>Note: Included in the first Blu-ray volume.</i><br><br>The second season of <i>Frieren</i>.<br><br>Frieren travels north with Fern and Stark.",
			),
		).toBe("Frieren travels north with Fern and Stark.");
	});

	test("keeps an initial within its sentence", () => {
		expect(synopsis("Agent J. Smith returns. He is tired.")).toBe(
			"Agent J. Smith returns. He is tired.",
		);
	});

	test("cuts a first sentence too long on its own at a word", () => {
		const result = synopsis(`${"word ".repeat(100).trim()}.`);
		expect(result.endsWith("word…")).toBe(true);
		expect(result.length).toBeLessThanOrEqual(320);
	});
});

describe("placeholder", () => {
	test("matches a sentence that only names the release", () => {
		expect(placeholder.test("Part 3 of Tensei Shitara Slime Datta Ken 4th Season.")).toBe(true);
		expect(placeholder.test("The second season of Witch Watch.")).toBe(true);
		expect(placeholder.test("Second season of Nezumi-kun no Chokki (TV)")).toBe(true);
	});

	test("leaves a story alone", () => {
		expect(placeholder.test("The second season of the war begins. Rimuru marches out.")).toBe(
			false,
		);
		expect(placeholder.test("Rimuru becomes a Demon Lord.")).toBe(false);
	});
});

describe("fuzzyDate", () => {
	test("uses the most precise prefix available", () => {
		expect(
			fuzzyDate({
				year: 2023,
				month: 9,
				day: 29,
			}),
		).toBe("2023-09-29");
		expect(
			fuzzyDate({
				year: 2023,
				month: 9,
				day: null,
			}),
		).toBe("2023-09");
		expect(
			fuzzyDate({
				year: 2023,
				month: null,
				day: null,
			}),
		).toBe("2023");
		expect(
			fuzzyDate({
				year: null,
				month: 9,
				day: 29,
			}),
		).toBeNull();
	});
});
