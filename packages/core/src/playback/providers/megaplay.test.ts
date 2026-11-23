import { describe, expect, test } from "bun:test";

import { Label } from "./label";

describe("Label.language", () => {
	test("tags plain labels by language", () => {
		expect(
			["Arabic", "English", "French", "German", "Italian", "Russian", "Spanish"].map(
				(label) => new Label(label).language,
			),
		).toEqual(["ar", "en", "fr", "de", "it", "ru", "es"]);
	});

	test("adds the region of MegaPlay's regional labels", () => {
		expect(new Label("Portuguese (- Portuguese(Brazil))").language).toBe("pt-BR");
		expect(new Label("Spanish (- Spanish(Latin America))").language).toBe("es-419");
	});

	test("keeps the plain language when the region is unknown", () => {
		expect(new Label("French (- French(Canada))").language).toBe("fr");
	});

	test("reads the language before a note such as a track type or number", () => {
		expect(new Label("English (English Signs [CR])").language).toBe("en");
		expect(new Label("German (German - (Forced))").language).toBe("de");
		expect(new Label("English 2").language).toBe("en");
		expect(new Label("Portuguese (Portuguese - (Brazil))").language).toBe("pt");
	});
});
