/** A value as `JSON.parse` returns it. */
export type Json =
	| string
	| number
	| boolean
	| null
	| Json[]
	| {
			[key: string]: Json;
	  };

/** An error class, such as `RangeError` or `UnknownAnimeError`. */
type ErrorClass = abstract new (...args: never[]) => Error;

/** The errors `attempt` hands back: the expected classes, or any `Error` when none are named. */
type Caught<TExpected extends ErrorClass[]> = TExpected extends []
	? Error
	: InstanceType<TExpected[number]>;

/**
 * The outcome of work that may fail, as a value.
 *
 * Exactly one of `data` and `error` is set, so checking `error` narrows
 * `data`, also after destructuring.
 */
export type Attempt<TData, TError extends Error = Error> =
	| {
			data: TData;
			error: null;
	  }
	| {
			data: null;
			error: TError;
	  };

/**
 * Settles a promise into an {@link Attempt} instead of rejecting.
 *
 * Name the error classes the caller handles and `error` is typed as them;
 * any other error still rejects. Name none and every error is handed back,
 * a thrown non-`Error` wrapped in one with the value as its `cause`.
 *
 * @example
 * ```ts
 * const { data, error } = await attempt(catalog.anime(id), UnknownAnimeError);
 * if (error) {
 *   return null;
 * }
 * ```
 */
export function attempt<TData, TExpected extends ErrorClass[] = []>(
	work: PromiseLike<TData>,
	...expected: TExpected
): Promise<Attempt<TData, Caught<TExpected>>>;
/**
 * Calls synchronous `work`, such as `JSON.parse`, and returns its result as an
 * {@link Attempt} instead of throwing, as the promise form does. Asynchronous
 * work is passed as its promise instead.
 */
export function attempt<TData, TExpected extends ErrorClass[] = []>(
	work: () => TData extends PromiseLike<unknown> ? never : TData,
	...expected: TExpected
): Attempt<TData, Caught<TExpected>>;

export function attempt<TData>(
	work: PromiseLike<TData> | (() => TData),
	...expected: ErrorClass[]
): Attempt<TData> | Promise<Attempt<TData>> {
	const failed = (cause: unknown) => {
		let error = new Error(String(cause), {
			cause,
		});

		if (cause instanceof Error) {
			error = cause;
		}

		if (expected.length > 0 && !expected.some((type) => error instanceof type)) {
			throw cause;
		}

		return {
			data: null,
			error,
		};
	};

	const succeeded = (data: TData) => ({
		data,
		error: null,
	});

	if ("then" in work) {
		return Promise.resolve(work).then(succeeded, failed);
	}

	try {
		return succeeded(work());
	} catch (error) {
		return failed(error);
	}
}

/**
 * The value, narrowed to exclude `null` and `undefined`, or an error when it
 * is absent. For a value the surrounding code guarantees, such as an array
 * item at an index already checked against its length.
 */
export const defined = <TValue>(value: TValue | null | undefined): TValue => {
	if (value === null || value === undefined) {
		throw new TypeError("Expected a value, found none");
	}

	return value;
};

export * from "./sequence";

export * from "./time";
