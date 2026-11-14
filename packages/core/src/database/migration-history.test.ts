import { describe, expect, test } from "bun:test";

import { readMigrationHistory, skippedMigrations } from "./migration-history";

const files = [
	{
		hash: "a",
		tag: "0001_first",
		when: 100,
	},
	{
		hash: "b",
		tag: "0002_second",
		when: 200,
	},
];

describe("skippedMigrations", () => {
	test("skips nothing on an empty database", () => {
		expect(skippedMigrations(files, [])).toEqual([]);
	});

	test("skips nothing when every recorded hash matches its file", () => {
		expect(
			skippedMigrations(files, [
				{
					createdAt: 100,
					hash: "a",
				},
			]),
		).toEqual([]);
	});

	test("names a file edited after it was applied", () => {
		expect(
			skippedMigrations(files, [
				{
					createdAt: 100,
					hash: "a",
				},
				{
					createdAt: 200,
					hash: "draft",
				},
			]),
		).toEqual(["0002_second was applied as a different version of its file"]);
	});

	test("names a file older than a migration another branch applied", () => {
		expect(
			skippedMigrations(files, [
				{
					createdAt: 200,
					hash: "b",
				},
				{
					createdAt: 300,
					hash: "other-branch",
				},
			]),
		).toEqual(["0001_first was never applied, and a newer migration was, so drizzle never will"]);
	});
});

test("migration timestamps only ever increase, so none is skipped after a merge", () => {
	const whens = readMigrationHistory(new URL("../../drizzle", import.meta.url).pathname).map(
		({ when }) => when,
	);
	expect(whens).toEqual([...whens].toSorted((left, right) => left - right));
	expect(new Set(whens).size).toBe(whens.length);
});
