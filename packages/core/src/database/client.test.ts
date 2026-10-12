import { afterAll, expect, test } from "bun:test";

import { SQL } from "bun";

import { config } from "../config";
import { closeDatabase, migrateDatabase, migrationLockKey } from "./client";

const other = new SQL(config.databaseUrl);

afterAll(async () => {
	await other.close();
	await closeDatabase();
});

test("migrating waits while another replica holds the lock", async () => {
	const holder = await other.reserve();
	await holder`select pg_advisory_lock(${migrationLockKey}::bigint)`;

	let finished = false;
	const migrating = migrateDatabase().then(() => {
		finished = true;
	});
	await Bun.sleep(500);
	expect(finished).toBe(false);

	await holder`select pg_advisory_unlock(${migrationLockKey}::bigint)`;
	holder.release();
	await migrating;
	expect(finished).toBe(true);
});

test("migrating twice at once leaves the database migrated", async () => {
	await Promise.all([migrateDatabase(), migrateDatabase()]);
});
