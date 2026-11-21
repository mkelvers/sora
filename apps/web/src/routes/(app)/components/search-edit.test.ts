import { expect, test } from "bun:test";

import { editedSearchHref } from "./search-edit";

const url = (path: string) => new URL(path, "https://sora.test");

test("clearing an existing query goes to the empty search page", () => {
	expect(editedSearchHref("", url("/search?q=Alpha"))).toBe("/search");
	expect(editedSearchHref("", url("/search"))).toBeUndefined();
});

test("a new query is encoded and an unchanged query needs no navigation", () => {
	const current = url("/search?q=Alpha");

	expect(editedSearchHref("A & B", current)).toBe("/search?q=A%20%26%20B");
	expect(editedSearchHref("Alpha", current)).toBeUndefined();
});

test("clearing while another query is pending returns to the empty search page", () => {
	const current = url("/search");
	const pending = url("/search?q=Alpha");

	expect(editedSearchHref("", current, pending)).toBe("/search");
	expect(editedSearchHref("Alpha", current, pending)).toBeUndefined();
});

test("debounced edits leave navigation outside the search page alone", () => {
	const search = url("/search?q=Alpha");
	const categories = url("/categories");

	expect(editedSearchHref("Beta", categories, search)).toBeUndefined();
	expect(editedSearchHref("Beta", search, categories)).toBeUndefined();
});
