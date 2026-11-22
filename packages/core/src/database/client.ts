import { attempt } from "@sora/shared";
import { SQL } from "bun";
import type { TransactionSQL } from "bun";
import { drizzle } from "drizzle-orm/bun-sql";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { runMigrations } from "graphile-worker";

import { config } from "../config";
import { readMigrationHistory, skippedMigrations } from "./migration-history";
import { definedColumns, missingSchema } from "./schema-check";
import * as auth from "./schema/auth";
import * as catalog from "./schema/catalog";
import * as library from "./schema/library";
import * as playback from "./schema/playback";
import * as scheduler from "./schema/scheduler";
import * as series from "./schema/series";

/**
 * The connection pool behind {@link db}. While a test holds a transaction
 * open, every query joins it, and a transaction the code opens itself
 * becomes a savepoint, so nothing the test writes is committed.
 */
class Connection {
	static readonly #rollback = new Error("Rolled back on purpose.");

	readonly #pool = new SQL(config.databaseUrl);
	#held: TransactionSQL | undefined;

	/** The SQL client every query goes through. */
	readonly client = new Proxy(this.#pool, {
		apply: (_target, _self, args: Parameters<SQL>) => this.#current()(...args),
		get: (_target, key) => this.#member(key),
	});

	/**
	 * Opens a transaction that every query joins, or a savepoint when one is
	 * already open, and returns the function that rolls it back. For tests.
	 */
	async isolate(): Promise<() => Promise<void>> {
		const outer = this.#held;
		const opened = Promise.withResolvers<undefined>();
		const finished = Promise.withResolvers<undefined>();

		const done = attempt(
			this.client.begin(async (transaction) => {
				this.#held = transaction;
				opened.resolve(undefined);
				await finished.promise;
				throw Connection.#rollback;
			}),
		);

		const failed = await Promise.race([opened.promise, done]);

		if (failed) {
			throw failed.error;
		}

		return async () => {
			finished.resolve(undefined);
			const { error } = await done;
			this.#held = outer;

			if (error !== Connection.#rollback) {
				throw error;
			}
		};
	}

	#current(): SQL {
		return this.#held ?? this.#pool;
	}

	/**
	 * The client members drizzle and the migrator use. Queries go to the held
	 * transaction, where `begin` opens a savepoint; the pool itself is only
	 * reserved and closed. Any other member is undefined, so a new caller
	 * fails loudly instead of bypassing the held transaction.
	 */
	#member(key: string | symbol) {
		const current = this.#current();

		if (key === "begin" && this.#held) {
			return this.#held.savepoint.bind(this.#held);
		}

		if (key === "begin") {
			return current.begin.bind(current);
		}

		if (key === "unsafe") {
			return current.unsafe.bind(current);
		}

		if (key === "reserve") {
			return this.#pool.reserve.bind(this.#pool);
		}

		if (key === "close") {
			return this.#pool.close.bind(this.#pool);
		}

		return undefined;
	}
}

export const connection = new Connection();

/**
 * The process-wide database connection.
 *
 * Persistence code imports this directly; it is never passed through
 * parameters or constructors.
 */
export const db = drizzle({
	client: connection.client,
	schema: {
		...auth,
		...catalog,
		...library,
		...playback,
		...scheduler,
		...series,
	},
});

const schemaModules = [auth, catalog, library, playback, scheduler, series];

/** The advisory lock replicas hold, one at a time, while they migrate. */
export const migrationLockKey = 7_302_024_001;

/**
 * Applies pending migrations from `packages/core/drizzle`, then
 * graphile-worker's own.
 *
 * Call once at process startup, before serving requests. Replicas starting
 * together take turns: each holds a PostgreSQL advisory lock while it
 * migrates, so a later one finds nothing left to apply.
 *
 * Refuses to migrate when drizzle would skip a migration without saying so
 * (see {@link skippedMigrations}), and fails after migrating when the
 * database still lacks a table or column the code defines (see
 * {@link missingSchema}), naming each one; AGENTS.md says how to repair the
 * database.
 */
export const migrateDatabase = async () => {
	const lock = await db.$client.reserve();

	const migrated = await attempt(
		(async () => {
			await lock`select pg_advisory_lock(${migrationLockKey}::bigint)`;
			const migrationsFolder = new URL("../../drizzle", import.meta.url).pathname;

			const [{ exists }] = await lock<[{ exists: boolean }]>`
        select to_regclass('drizzle.__drizzle_migrations') is not null as exists
      `;

			const recorded = exists
				? await lock<
						{
							created_at: string;
							hash: string;
						}[]
					>`
            select created_at, hash from drizzle.__drizzle_migrations
          `
				: [];

			const files = readMigrationHistory(migrationsFolder);

			const skipped = skippedMigrations(
				files,
				recorded.map(({ created_at, hash }) => ({
					createdAt: Number(created_at),
					hash,
				})),
			);

			if (skipped.length > 0) {
				throw new Error(
					`The database's migration history does not match packages/core/drizzle, so drizzle would skip migrations without saying so. Repair it as AGENTS.md says under "Database migrations":\n${skipped.map((reason) => `- ${reason}`).join("\n")}`,
				);
			}

			await migrate(db, {
				migrationsFolder,
			});
			// The catalog enqueues scheduler jobs with SQL, so graphile-worker's schema
			// must exist before any request, not only once a scheduler has started.
			await runMigrations({
				connectionString: config.databaseUrl,
			});

			const live = await lock<
				{
					column: string;
					schema: string;
					table: string;
				}[]
			>`
        select table_schema as schema, table_name as table, column_name as column
        from information_schema.columns
      `;

			const missing = missingSchema(definedColumns(schemaModules), live);

			if (missing.length > 0) {
				const known = new Set(files.map(({ when }) => when));

				const foreign = recorded
					.map(({ created_at }) => Number(created_at))
					.filter((createdAt) => !known.has(createdAt))
					.toSorted((first, second) => first - second)
					.map((createdAt) => `${createdAt} (${new Date(createdAt).toISOString()})`);

				throw new Error(
					`The database lacks tables or columns this checkout's schema defines, so queries would fail. A migration from another branch or a dropped draft usually changed them. Repair it as AGENTS.md says under "Database migrations".\nMissing:\n${missing.map((name) => `- ${name}`).join("\n")}\nRecorded migrations with no file in this checkout (newest last):\n${foreign.map((name) => `- ${name}`).join("\n") || "- none"}`,
				);
			}
		})(),
	);

	// Releasing the connection ends the session, which drops the lock even when unlocking failed.
	await attempt(lock`select pg_advisory_unlock(${migrationLockKey}::bigint)`);
	lock.release();

	if (migrated.error) {
		throw migrated.error;
	}
};
