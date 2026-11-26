import { parseSQLFile, queryASTToIR } from "@pgtyped/parser";
import { processSQLQueryIR } from "@pgtyped/runtime";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

/** A column, named `schema.table.column`, as the database or the code has it. */
export interface ColumnName {
	column: string;
	schema: string;
	table: string;
}

/** Every column the tables among `modules`' exports define. */
export const definedColumns = <TModule extends Record<string, unknown>>(
	modules: TModule[],
): ColumnName[] =>
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

/** One query of a `.sql` file, as the SQL it sends, with `$1`-style parameters. */
export interface FileQuery {
	/** The file, relative to `src`, such as `series/sql/franchise-relations.sql`. */
	file: string;
	/** Its pgTyped `@name`. */
	name: string;
	text: string;
}

/**
 * Every query of the `.sql` files under `src`: the ones `bun run sql:generate`
 * types (see `pgtyped.config.json`), which `migrate` prepares against the
 * database to check they still fit it. Generating checks them only against
 * the database it ran on, which can differ from the one a deploy migrates.
 *
 * @throws {Error} when a file does not parse as pgTyped's annotated SQL.
 */
export const fileQueries = async (): Promise<FileQuery[]> => {
	const source = new URL("..", import.meta.url).pathname;
	const files = await Array.fromAsync(new Bun.Glob("**/*.sql").scan(source));

	const queries = await Promise.all(
		files.toSorted().map(async (file) => {
			const { events, queries: parsed } = parseSQLFile(await Bun.file(`${source}${file}`).text());
			const failure = events.find((event) => "critical" in event);

			if (failure) {
				throw new Error(`${file} does not parse as pgTyped SQL: ${failure.message.text}`);
			}

			return parsed.map((query) => ({
				file,
				name: query.name,
				text: processSQLQueryIR(queryASTToIR(query)).query,
			}));
		}),
	);

	return queries.flat();
};
