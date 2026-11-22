import { expect, test } from "bun:test";

import { integer, pgSchema, pgTable, text } from "drizzle-orm/pg-core";

import { definedColumns, missingSchema } from "./schema-check";

const series = pgTable("series", {
	id: integer("id").primaryKey(),
	title: text("title"),
});

const live = [
	{
		column: "id",
		schema: "public",
		table: "series",
	},
	{
		column: "title",
		schema: "public",
		table: "series",
	},
];

test("definedColumns reads every column of every table, skipping other exports", () => {
	const jobs = pgSchema("worker").table("jobs", {
		id: integer("id"),
	});

	expect(
		definedColumns([
			{
				jobs,
				series,
				unrelated: "not a table",
			},
		]),
	).toEqual([
		{
			column: "id",
			schema: "worker",
			table: "jobs",
		},
		...live,
	]);
});

test("missingSchema finds nothing when the database has every column", () => {
	expect(missingSchema(definedColumns([{ series }]), live)).toEqual([]);
});

test("missingSchema names a missing table once", () => {
	expect(missingSchema(definedColumns([{ series }]), [])).toEqual(["table public.series"]);
});

test("missingSchema names a missing column", () => {
	expect(missingSchema(definedColumns([{ series }]), live.slice(0, 1))).toEqual([
		"column public.series.title",
	]);
});
