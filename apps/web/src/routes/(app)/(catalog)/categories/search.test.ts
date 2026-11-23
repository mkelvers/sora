import { expect, test } from "bun:test";

import { CategorySearch } from "./search";

test("matches abbreviated and case-insensitive category values", () => {
	expect(new CategorySearch("iskai").matches("Tags Isekai")).toBe(true);
	expect(new CategorySearch("MADHOUSE").matches("Studios Madhouse")).toBe(true);
	expect(new CategorySearch("sci fi").matches("Genres Sci-Fi")).toBe(true);
});

test("matches section names and requires every query word", () => {
	expect(new CategorySearch("studios").matches("Studios Bones")).toBe(true);
	expect(new CategorySearch("studios bones").matches("Studios Bones")).toBe(true);
	expect(new CategorySearch("studios bones").matches("Studios Madhouse")).toBe(false);
	expect(new CategorySearch("iskai").matches("Genres Romance")).toBe(false);
});

test("empty and whitespace queries retain all values", () => {
	expect(new CategorySearch("").matches("Genres Action")).toBe(true);
	expect(new CategorySearch("  \t ").matches("Tags Isekai")).toBe(true);
});
