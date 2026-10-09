import { describe, expect, test } from "bun:test";

import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

import { catalogFormatAllowed, excludedFormats, isCatalogFormat } from "./visibility";

describe("catalog visibility", () => {
	test("offers ONA titles such as Overgeared in series cards and AniList browsing", () => {
		expect(isCatalogFormat("ONA")).toBe(true);
		expect(excludedFormats).not.toContain("ONA");
	});

	test("does not exclude ONA from database search and series queries", () => {
		const query = new PgDialect().sqlToQuery(catalogFormatAllowed(sql`format`));
		expect(query.params).not.toContain("ONA");
	});

	test("continues to hide short TV series", () => {
		expect(isCatalogFormat("TV_SHORT")).toBe(false);
		expect(excludedFormats).toContain("TV_SHORT");
		const query = new PgDialect().sqlToQuery(catalogFormatAllowed(sql`format`));
		expect(query.params).toContain("TV_SHORT");
	});

	test("keeps TV, movies, OVAs, specials, and unknown formats visible", () => {
		for (const format of ["TV", "MOVIE", "OVA", "SPECIAL", null, undefined]) {
			expect(isCatalogFormat(format)).toBe(true);
		}
	});
});
