import { describe, expect, test } from "bun:test";

import { fuzzyDate, plainText } from "./text";

describe("plainText", () => {
  test("converts line breaks, strips tags, and decodes entities", () => {
    expect(plainText("A <i>quiet</i> journey.<br><br>Frieren &amp; Fern&#39;s story."))
      .toBe("A quiet journey.\n\nFrieren & Fern's story.");
  });

  test("removes a trailing source attribution", () => {
    expect(plainText("An elf mage outlives her party.\n\n(Source: Crunchyroll)")).toBe("An elf mage outlives her party.");
  });

  test("keeps parenthetical text that is not an attribution", () => {
    expect(plainText("Season two (final part)")).toBe("Season two (final part)");
  });
});

describe("fuzzyDate", () => {
  test("uses the most precise prefix available", () => {
    expect(fuzzyDate({
      year: 2023,
      month: 9,
      day: 29
    })).toBe("2023-09-29");
    expect(fuzzyDate({
      year: 2023,
      month: 9,
      day: null
    })).toBe("2023-09");
    expect(fuzzyDate({
      year: 2023,
      month: null,
      day: null
    })).toBe("2023");
    expect(fuzzyDate({
      year: null,
      month: 9,
      day: 29
    })).toBeNull();
  });
});
