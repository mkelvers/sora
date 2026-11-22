import { afterAll, afterEach, beforeAll, beforeEach } from "bun:test";

import { connection } from "../src/database/client";

// Database tests run on the development database and leave nothing in it:
// each file runs inside one transaction and each test inside a savepoint,
// and both are rolled back.
let rollBackFile: () => Promise<void>;
let rollBackTest: () => Promise<void>;

beforeAll(async () => {
	rollBackFile = await connection.rollBackLater();
});

beforeEach(async () => {
	rollBackTest = await connection.rollBackLater();
});

afterEach(async () => {
	await rollBackTest();
});

afterAll(async () => {
	await rollBackFile();
});
