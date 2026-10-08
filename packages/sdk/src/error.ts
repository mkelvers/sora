import { z } from "@hono/zod-openapi";
import type { Problem } from "@sora/api";
import { ProblemSchema } from "@sora/api/contract";
import { attempt } from "@sora/shared";

/**
 * What a failed response may carry: the API's problem, or Better Auth's
 * `{ message, code }` from the `/v1/auth` endpoints.
 */
const FailureBodySchema = ProblemSchema.pick({
	detail: true,
	code: true,
	errors: true,
})
	.partial()
	.extend({
		message: z.string().optional(),
	});

/**
 * A request the API answered with an error.
 *
 * Branch on {@link SoraError.code}, which is stable, such as
 * `SERIES_NOT_FOUND` or `PLAYBACK_UNAVAILABLE`; the message may change. The
 * API may add codes, so handle ones you do not know.
 */
export class SoraError extends Error {
	/** The HTTP status. */
	readonly status: number;
	/** The API's failure code, or `HTTP_ERROR` when the response carried no problem body. */
	readonly code: string;
	/** Every invalid field, for `INVALID_INPUT`. */
	readonly errors: NonNullable<Problem["errors"]>;
	/** How long the API asked to wait before retrying, in seconds, when it said. */
	readonly retryAfterSeconds: number | null;

	constructor(
		message: string,
		details: {
			status: number;
			code: string;
			errors?: Problem["errors"];
			retryAfterSeconds: number | null;
		},
	) {
		super(message);
		this.name = "SoraError";
		this.status = details.status;
		this.code = details.code;
		this.errors = details.errors ?? [];
		this.retryAfterSeconds = details.retryAfterSeconds;
	}

	/** Builds the error for a failed response, reading its problem or Better Auth body when it has one. */
	static async from(response: {
		status: number;
		statusText: string;
		headers: Headers;
		json(): Promise<unknown>;
	}): Promise<SoraError> {
		// A proxy can return HTML or unrelated JSON; only use fields we recognize.
		const body = await attempt(response.json());
		const parsed = FailureBodySchema.safeParse(body.data);
		const problem = parsed.success ? parsed.data : null;
		const retryAfterHeader = response.headers.get("Retry-After");
		const retryAfterSeconds = Number(retryAfterHeader);
		const retryAfterDate = retryAfterHeader ? new Date(retryAfterHeader) : null;
		const retryAfter =
			retryAfterSeconds > 0
				? retryAfterSeconds
				: retryAfterDate && !Number.isNaN(retryAfterDate.getTime())
					? Math.max(0, Math.round((retryAfterDate.getTime() - Date.now()) / 1000))
					: null;

		return new SoraError(
			problem?.detail ??
				problem?.message ??
				`The API answered ${response.status} ${response.statusText}`,
			{
				status: response.status,
				code: problem?.code ?? "HTTP_ERROR",
				errors: problem?.errors,
				retryAfterSeconds: retryAfter,
			},
		);
	}
}
