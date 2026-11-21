import { afterAll } from "bun:test";

import { enableDatabaseTests, testDatabaseNamePattern } from "./integration";

const name = process.env.SORA_TEST_DATABASE;
const url = URL.parse(process.env.DATABASE_URL ?? "");
if (
	!name ||
	!testDatabaseNamePattern.test(name) ||
	url?.protocol !== "postgresql:" ||
	!url.hostname ||
	url.pathname !== `/${name}` ||
	url.search ||
	url.hash
) {
	throw new Error("Integration tests require a disposable database from test:integration.");
}

const { closeDatabase, db, migrateDatabase } = await import("../src/database/client");
const [{ database }] = await db.$client<[{ database: string }]>`
	select current_database() as database
`;
if (database !== name) {
	throw new Error("PostgreSQL connected to the wrong integration test database.");
}
await migrateDatabase();
afterAll(closeDatabase);
enableDatabaseTests();
