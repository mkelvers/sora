import { afterAll, afterEach, beforeAll, beforeEach } from "bun:test";

import { connection } from "../src/database/client";

// Database tests run on the development database and leave nothing in it:
// each file runs inside one transaction and each test inside a savepoint,
// and both are rolled back.
let rollbackFile: () => Promise<void>;
let rollbackTest: () => Promise<void>;

beforeAll(async () => {
	rollbackFile = await connection.isolate();
});

beforeEach(async () => {
	rollbackTest = await connection.isolate();
});

afterEach(async () => {
	await rollbackTest();
});

afterAll(async () => {
	await rollbackFile();
});
