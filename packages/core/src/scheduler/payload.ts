import { attempt } from "@sora/shared";
import type { Task, TaskList } from "graphile-worker";
import type { z } from "zod";

/**
 * A job's payload does not match what its task expects. It fails the same
 * way on every attempt, so {@link failInvalidPayloads} fails the job for
 * good rather than letting graphile-worker retry it.
 */
export class InvalidPayloadError extends Error {
	override name = "InvalidPayloadError";
}

/** Reads a job's payload with `schema`, throwing {@link InvalidPayloadError} when it does not match. */
export const parsePayload = <TSchema extends z.ZodType>(
	schema: TSchema,
	payload: Parameters<Task>[0],
): z.output<TSchema> => {
	const result = schema.safeParse(payload);

	if (!result.success) {
		const problems = result.error.issues.map(
			(issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`,
		);

		throw new InvalidPayloadError(`Invalid payload: ${problems.join("; ")}`, {
			cause: result.error,
		});
	}

	return result.data;
};

/**
 * `error` with the message of each error behind it added to its own, one
 * per line, and their stacks to its stack, or `error` itself when nothing
 * caused it. graphile-worker logs and stores only a failed job's message
 * and stack, so the cause, such as the Postgres error behind drizzle's
 * "Failed query", would otherwise be lost.
 */
const withCauses = (error: Error): Error => {
	const chain = [error];
	let { cause } = error;

	while (cause instanceof Error && !chain.includes(cause)) {
		chain.push(cause);
		({ cause } = cause);
	}

	if (chain.length === 1) {
		return error;
	}

	const described = new Error(
		chain
			.map((link, index) =>
				index === 0 ? link.message : `Caused by ${link.name}: ${link.message}`,
			)
			.join("\n"),
		{
			cause: error,
		},
	);

	described.stack = chain
		.map((link) => link.stack ?? `${link.name}: ${link.message}`)
		.join("\nCaused by ");

	return described;
};

/**
 * Has each task fail its job for good when it throws
 * {@link InvalidPayloadError}, on the first attempt, so a payload that can
 * never be read is not retried 25 times. The job stays in the queue as
 * failed, with the error as its `last_error`, until `pruneDeadJobsJob`
 * logs and drops it. Every other error rethrows with its causes in its
 * message (see {@link withCauses}), so graphile-worker retries it with
 * backoff as before.
 *
 * graphile-worker 0.18 has no way to fail a running job for good:
 * `permanently_fail_jobs` skips locked jobs, and every thrown error is
 * retried until `attempts` reaches `max_attempts`. So the job's
 * `max_attempts` is lowered to the attempts it has made before rethrowing,
 * and graphile-worker's own failure handling then records the error and
 * unlocks it, never to be picked up again.
 */
export const failInvalidPayloads = (tasks: Record<string, Task>): TaskList =>
	Object.fromEntries(
		Object.entries(tasks).map(([name, task]): [string, Task] => [
			name,
			async (payload, helpers) => {
				const { error } = await attempt(
					(async () => {
						await task(payload, helpers);
					})(),
				);

				if (!error) {
					return;
				}

				if (error instanceof InvalidPayloadError) {
					helpers.logger.warn(
						`Job ${helpers.job.id} (${name}) has a payload it can never run with, so it is not retried: ${JSON.stringify(payload)}`,
					);
					await helpers.query(
						`update graphile_worker._private_jobs
              set max_attempts = attempts
              where id = $1::bigint and locked_by = $2::text`,
						[helpers.job.id, helpers.job.locked_by],
					);
					throw error;
				}

				throw withCauses(error);
			},
		]),
	);
