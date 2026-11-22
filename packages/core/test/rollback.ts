import { afterAll, afterEach, beforeAll, beforeEach } from "bun:test";

import { connection } from "../src/database/client";

// Database tests run on the development database and leave nothing in it:
// each file runs inside one transaction and each test inside a savepoint,
// and both are rolled back, innermost first.
/** The open savepoints of the running file and test, innermost last. */
class Savepoints {
	readonly #rollbacks: (() => Promise<void>)[] = [];

	async open() {
		this.#rollbacks.push(await connection.isolate());
	}

	async close() {
		await this.#rollbacks.pop()?.();
	}
}

const savepoints = new Savepoints();

beforeAll(() => savepoints.open());

beforeEach(() => savepoints.open());

afterEach(() => savepoints.close());

afterAll(() => savepoints.close());
