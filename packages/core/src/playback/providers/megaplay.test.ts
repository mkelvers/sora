import { describe, expect, test } from "bun:test";

import { subtitleLanguage } from "./megaplay";

describe("subtitleLanguage", () => {
	test("tags plain labels by language", () => {
		expect(
			["Arabic", "English", "French", "German", "Italian", "Russian", "Spanish"].map(
				subtitleLanguage,
			),
		).toEqual(["ar", "en", "fr", "de", "it", "ru", "es"]);
	});

	test("adds the region of MegaPlay's regional labels", () => {
		expect(subtitleLanguage("Portuguese (- Portuguese(Brazil))")).toBe("pt-BR");
		expect(subtitleLanguage("Spanish (- Spanish(Latin America))")).toBe("es-419");
	});

	test("keeps the plain language when the region is unknown", () => {
		expect(subtitleLanguage("French (- French(Canada))")).toBe("fr");
	});

	test("reads the language before a note such as a track type or number", () => {
		expect(subtitleLanguage("English (English Signs [CR])")).toBe("en");
		expect(subtitleLanguage("German (German - (Forced))")).toBe("de");
		expect(subtitleLanguage("English 2")).toBe("en");
		expect(subtitleLanguage("Portuguese (Portuguese - (Brazil))")).toBe("pt");
	});
});
