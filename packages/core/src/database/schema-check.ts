import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

/** A column, named `schema.table.column`, as the database or the code has it. */
export interface ColumnName {
	column: string;
	schema: string;
	table: string;
}

/** Every column the tables among `modules`' exports define. */
export const definedColumns = (modules: Record<string, unknown>[]): ColumnName[] =>
	modules.flatMap((module) =>
		Object.values(module).flatMap((value) => {
			if (!is(value, PgTable)) {
				return [];
			}
			const { columns, name, schema = "public" } = getTableConfig(value);
			return columns.map((column) => ({
				column: column.name,
				schema,
				table: name,
			}));
		}),
	);

/**
 * The tables and columns the code defines that the database lacks, each
 * named once: a missing table is reported alone, not column by column.
 *
 * The shared dev database takes every branch's migrations, so a migration
 * from a branch that was later dropped can rename or remove what this
 * checkout queries. Drizzle's migrator cannot notice, because it only
 * compares migration records, never the schema itself.
 */
export const missingSchema = (defined: ColumnName[], live: ColumnName[]): string[] => {
	const liveTables = new Set(live.map(({ schema, table }) => `${schema}.${table}`));
	const liveColumns = new Set(
		live.map(({ column, schema, table }) => `${schema}.${table}.${column}`),
	);
	const missing = new Set<string>();
	for (const { column, schema, table } of defined) {
		const tableName = `${schema}.${table}`;
		if (!liveTables.has(tableName)) {
			missing.add(`table ${tableName}`);
		} else if (!liveColumns.has(`${tableName}.${column}`)) {
			missing.add(`column ${tableName}.${column}`);
		}
	}
	return [...missing];
};
