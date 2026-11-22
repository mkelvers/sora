import { describe, expect, mock, test } from "bun:test";

import { attempt } from "@sora/shared";
import type { JobHelpers, Task } from "graphile-worker";
import { z } from "zod";

import { lookUpEpisodes } from "./jobs/episodes";
import { InvalidPayloadError, failInvalidPayloads, parsePayload } from "./payload";

const task = "test-task";

/** The part of {@link JobHelpers} that `failInvalidPayloads` reads. */
type Running = Pick<JobHelpers, "query"> & {
	job: Pick<JobHelpers["job"], "id" | "locked_by">;
	logger: Pick<JobHelpers["logger"], "warn">;
};

/** Helpers for a running job, recording the SQL it sends. */
const runningJob = () => {
	const query = mock((text: string, values: unknown[]) =>
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

	const running: Running = {
		job: {
			id: "42",
			locked_by: "worker-1",
		},
		logger: {
			warn: mock(),
		},
		query,
	};

	// SAFETY: failInvalidPayloads reads only the members `Running` has.
	const helpers = running as JobHelpers;

	return {
		helpers,
		query,
	};
};

/** Runs `run` as {@link task} the way the scheduler does. */
const runWrapped = async (run: Task, payload: unknown, helpers: JobHelpers) => {
	const wrapped = failInvalidPayloads({
		[task]: run,
	})[task];

	if (!wrapped) {
		throw new Error(`${task} is not in the task list`);
	}

	await wrapped(payload, helpers);
};

describe("parsePayload", () => {
	const schema = z.object({
		anilistId: z.number().int().positive(),
	});

	test("returns the payload when it matches", () => {
		expect(
			parsePayload(schema, {
				anilistId: 1,
			}),
		).toEqual({
			anilistId: 1,
		});
	});

	test("throws InvalidPayloadError naming the field when it does not", () => {
		expect(() =>
			parsePayload(schema, {
				anilistId: -155_682_372,
			}),
		).toThrow(InvalidPayloadError);
		expect(() =>
			parsePayload(schema, {
				anilistId: -155_682_372,
			}),
		).toThrow("anilistId");
	});
});

describe("failInvalidPayloads", () => {
	test("fails a job with an invalid payload for good on its first attempt", async () => {
		const { helpers, query } = runningJob();

		const run = runWrapped(
			lookUpEpisodes,
			{
				anilistId: -155_682_372,
			},
			helpers,
		);

		await expect(run).rejects.toBeInstanceOf(InvalidPayloadError);
		expect(query).toHaveBeenCalledTimes(1);
		expect(query.mock.calls[0]).toEqual([
			expect.stringContaining("set max_attempts = attempts"),
			["42", "worker-1"],
		]);
	});

	test("keeps retrying a job that fails for any other reason", async () => {
		const { helpers, query } = runningJob();
		const outage = new Error("AniList answered 502");

		const run = runWrapped(
			() => Promise.reject(outage),
			{
				anilistId: 1,
			},
			helpers,
		);

		await expect(run).rejects.toBe(outage);
		expect(query).not.toHaveBeenCalled();
	});

	test("puts the errors behind a failure in its message and stack", async () => {
		const { helpers, query } = runningJob();
		const postgres = new Error('column "no_opening" does not exist');
		postgres.name = "PostgresError";

		const failedQuery = new Error('Failed query: select "no_opening" from "skip_detection"', {
			cause: postgres,
		});

		const { error } = await attempt(runWrapped(() => Promise.reject(failedQuery), {}, helpers));

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
		const { helpers, query } = runningJob();

		const run = runWrapped(
			() => {
				z.object({
					id: z.number(),
				}).parse({});
			},
			{},
			helpers,
		);

		await expect(run).rejects.toBeInstanceOf(z.ZodError);
		expect(query).not.toHaveBeenCalled();
	});

	test("leaves a job that succeeds alone", async () => {
		const { helpers, query } = runningJob();

		await runWrapped(async () => {}, {}, helpers);

		expect(query).not.toHaveBeenCalled();
	});
});
