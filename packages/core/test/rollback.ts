import { afterAll, afterEach, beforeAll, beforeEach } from "bun:test";

import { connection } from "../src/database/client";

// Database tests run on the development database and leave nothing in it:
// each file runs inside one transaction and each test inside a savepoint,
// and both are rolled back, innermost first.
const rollbacks: (() => Promise<void>)[] = [];

const open = async () => {
	rollbacks.push(await connection.isolate());
};

const close = async () => {
	await rollbacks.pop()?.();
};

beforeAll(open);
beforeEach(open);
afterEach(close);
afterAll(close);
