import { afterAll, afterEach, beforeAll, beforeEach } from "bun:test";

import { rollBackLater } from "../src/database/client";

// Database tests run on the development database and leave nothing in it:
// each file runs inside one transaction and each test inside a savepoint,
// and both are rolled back.
let rollBackFile: () => Promise<void>;
let rollBackTest: () => Promise<void>;

beforeAll(async () => {
	rollBackFile = await rollBackLater();
});

beforeEach(async () => {
	rollBackTest = await rollBackLater();
});

afterEach(async () => {
	await rollBackTest();
});

afterAll(async () => {
	await rollBackFile();
});
