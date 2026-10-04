/**
 * The outcome of work that may fail, as a value.
 *
 * Exactly one of `data` and `error` is set, so checking `error` narrows
 * `data`, also after destructuring:
 *
 * @example
 * ```ts
 * const { data: body, error } = await attempt(response.json());
 * if (error) {
 *   throw new UpstreamUnavailableError("The body is not JSON", {
 *     retryAfterMs: null,
 *     cause: error,
 *   });
 * }
 * ```
 */
export type Attempt<T> =
	| {
			data: T;
			error: null;
	  }
	| {
			data: null;
			error: Error;
	  };

/**
 * Settles a promise into an {@link Attempt} instead of rejecting.
 *
 * A rejection with something other than an `Error` is wrapped in one, with
 * the original value as its `cause`.
 */
export function attempt<T>(work: PromiseLike<T>): Promise<Attempt<T>>;
/** Calls `work` and settles its promise into an {@link Attempt}, catching a synchronous throw too. */
export function attempt<T>(work: () => PromiseLike<T>): Promise<Attempt<T>>;
/** Calls `work` and returns its result as an {@link Attempt} instead of throwing. */
export function attempt<T>(work: () => T): Attempt<T>;
export function attempt<T>(
	work: PromiseLike<T> | (() => T | PromiseLike<T>),
): Attempt<T> | Promise<Attempt<T>> {
	let result: T | PromiseLike<T>;
	try {
		result = typeof work === "function" ? work() : work;
	} catch (error) {
		return failed(error);
	}

	if (!isPromiseLike(result)) {
		return {
			data: result,
			error: null,
		};
	}

	return Promise.resolve(result).then(
		(data) => ({
			data,
			error: null,
		}),
		failed,
	);
}

function failed(error: unknown): {
	data: null;
	error: Error;
} {
	return {
		data: null,
		error:
			error instanceof Error
				? error
				: new Error(String(error), {
						cause: error,
					}),
	};
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
	return (
		typeof value === "object" &&
		value !== null &&
		"then" in value &&
		typeof value.then === "function"
	);
}
