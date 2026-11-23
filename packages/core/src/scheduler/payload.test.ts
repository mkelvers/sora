import { describe, expect, mock, test } from "bun:test";

import { attempt } from "@sora/shared";
import { Logger } from "graphile-worker";
import type { JobHelpers, Task } from "graphile-worker";
import { z } from "zod";

import { lookUpEpisodes } from "./jobs/episodes";
import { InvalidPayloadError, failInvalid, parseInput } from "./payload";

const task = "test-task";

/** A running job's helpers, recording the SQL it sends. */
class RunningJob {
	readonly query = mock((text: string, values: unknown[]) =>
		Promise.resolve({
			command: "UPDATE",
			fields: [],
			oid: 0,
			rowCount: 0,
			rows: [],
			text,
			values,
		}),
	);

	readonly helpers: JobHelpers = {
		abortPromise: Promise.withResolvers<never>().promise,
		abortSignal: new AbortController().signal,
		addJob: () => Promise.reject(new Error("The payload test must not enqueue a job")),
		addJobs: () => Promise.reject(new Error("The payload test must not enqueue jobs")),
		getQueueName: () => null,
		job: {
			attempts: 1,
			created_at: new Date(0),
			flags: null,
			id: "42",
			is_available: false,
			job_queue_id: null,
			key: null,
			last_error: null,
			locked_at: new Date(0),
			locked_by: "worker-1",
			max_attempts: 25,
			payload: {},
			priority: 0,
			revision: 0,
			run_at: new Date(0),
			task_id: 1,
			task_identifier: task,
			updated_at: new Date(0),
		},
		logger: new Logger(() => mock()),
		query: this.query,
		withPgClient: () =>
			Promise.reject(new Error("The payload test must not acquire a database client")),
	};

	/** Runs `run` as {@link task} the way the scheduler does. */
	async run(run: Task, payload: Parameters<Task>[0]) {
		const wrapped = failInvalid({
			[task]: run,
		})[task];

		if (!wrapped) {
			throw new Error(`${task} is not in the task list`);
		}

		await wrapped(payload, this.helpers);
	}
}

describe("parseInput", () => {
	const schema = z.object({
		anilistId: z.number().int().positive(),
	});

	test("returns the payload when it matches", () => {
		expect(
			parseInput(schema, {
				anilistId: 1,
			}),
		).toEqual({
			anilistId: 1,
		});
	});

	test("throws InvalidPayloadError naming the field when it does not", () => {
		expect(() =>
			parseInput(schema, {
				anilistId: -155_682_372,
			}),
		).toThrow(InvalidPayloadError);
		expect(() =>
			parseInput(schema, {
				anilistId: -155_682_372,
			}),
		).toThrow("anilistId");
	});
});

describe("failInvalid", () => {
	test("fails a job with an invalid payload for good on its first attempt", async () => {
		const job = new RunningJob();
		const { query } = job;

		const run = job.run(lookUpEpisodes, {
			anilistId: -155_682_372,
		});

		await expect(run).rejects.toBeInstanceOf(InvalidPayloadError);
		expect(query).toHaveBeenCalledTimes(1);
		expect(query.mock.calls[0]).toEqual([
			expect.stringContaining("set max_attempts = attempts"),
			["42", "worker-1"],
		]);
	});

	test("keeps retrying a job that fails for any other reason", async () => {
		const job = new RunningJob();
		const { query } = job;
		const outage = new Error("AniList answered 502");

		const run = job.run(() => Promise.reject(outage), {
			anilistId: 1,
		});

		await expect(run).rejects.toBe(outage);
		expect(query).not.toHaveBeenCalled();
	});

	test("puts the errors behind a failure in its message and stack", async () => {
		const job = new RunningJob();
		const { query } = job;
		const postgres = new Error('column "no_opening" does not exist');
		postgres.name = "PostgresError";

		const failedQuery = new Error('Failed query: select "no_opening" from "skip_detection"', {
			cause: postgres,
		});

		const { error } = await attempt(job.run(() => Promise.reject(failedQuery), {}));

		expect(error).toBeInstanceOf(Error);
		expect(error).toMatchObject({
			cause: failedQuery,
			message:
				'Failed query: select "no_opening" from "skip_detection"\nCaused by PostgresError: column "no_opening" does not exist',
			stack: expect.stringContaining(
				'\nCaused by PostgresError: column "no_opening" does not exist',
			),
		});
		expect(query).not.toHaveBeenCalled();
	});

	test("keeps retrying a job whose own Zod parsing fails, such as of an upstream response", async () => {
		const job = new RunningJob();
		const { query } = job;

		const run = job.run(() => {
			z.object({
				id: z.number(),
			}).parse({});
		}, {});

		await expect(run).rejects.toBeInstanceOf(z.ZodError);
		expect(query).not.toHaveBeenCalled();
	});

	test("leaves a job that succeeds alone", async () => {
		const job = new RunningJob();
		const { query } = job;

		await job.run(async () => {}, {});

		expect(query).not.toHaveBeenCalled();
	});
});
