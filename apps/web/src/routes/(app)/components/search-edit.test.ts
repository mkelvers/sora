import { expect, test } from "bun:test";

import { editedSearchHref } from "./search-edit";

test("clearing an existing query goes to the empty search page", () => {
	expect(editedSearchHref("", new URL("/search?q=Alpha", "https://sora.test"))).toBe("/search");
	expect(editedSearchHref("", new URL("/search", "https://sora.test"))).toBeUndefined();
});

test("a new query is encoded and an unchanged query needs no navigation", () => {
	const current = new URL("/search?q=Alpha", "https://sora.test");

	expect(editedSearchHref("A & B", current)).toBe("/search?q=A%20%26%20B");
	expect(editedSearchHref("Alpha", current)).toBeUndefined();
});

test("clearing while another query is pending returns to the empty search page", () => {
	const current = new URL("/search", "https://sora.test");
	const pending = new URL("/search?q=Alpha", "https://sora.test");

	expect(editedSearchHref("", current, pending)).toBe("/search");
	expect(editedSearchHref("Alpha", current, pending)).toBeUndefined();
});

test("debounced edits leave navigation outside the search page alone", () => {
	const search = new URL("/search?q=Alpha", "https://sora.test");
	const categories = new URL("/categories", "https://sora.test");

	expect(editedSearchHref("Beta", categories, search)).toBeUndefined();
	expect(editedSearchHref("Beta", search, categories)).toBeUndefined();
});
