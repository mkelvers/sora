import { afterAll, describe, expect, test } from "bun:test";

import { SQL } from "bun";

import { config } from "../config";
import { brokenQueries, migrate, migrationLockKey } from "./client";
import { fileQueries } from "./schema-check";

describe("database migrations", () => {
	const other = new SQL(config.databaseUrl);

	afterAll(async () => {
		await other.close();
	});

	test("migrating waits while another replica holds the lock", async () => {
		const holder = await other.reserve();
		await holder`select pg_advisory_lock(${migrationLockKey}::bigint)`;

		let finished = false;

		const migrating = (async () => {
			await migrate();
			finished = true;
		})();

		await Bun.sleep(500);
		expect(finished).toBe(false);

		await holder`select pg_advisory_unlock(${migrationLockKey}::bigint)`;
		holder.release();
		await migrating;
		expect(finished).toBe(true);
	});

	test("migrating twice at once leaves the database migrated", async () => {
		await Promise.all([migrate(), migrate()]);
	});

	test("every .sql query fits the database, and one naming a missing column does not", async () => {
		const session = await other.reserve();

		const broken = await brokenQueries(session, [
			...(await fileQueries()),
			{
				file: "series/sql/broken.sql",
				name: "Broken",
				text: "select no_such_column from series where id = $1",
			},
		]);

		session.release();

		expect(broken).toEqual([
			'series/sql/broken.sql (Broken): column "no_such_column" does not exist',
		]);
	});
});
