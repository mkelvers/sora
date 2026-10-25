/** An error class, such as `RangeError` or `AnimeNotFoundError`. */
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
const settle = <TData, TExpected extends ErrorClass[]>(
	work: PromiseLike<TData> | (() => TData),
	...expected: TExpected
): Attempt<TData, Caught<TExpected>> | Promise<Attempt<TData, Caught<TExpected>>> => {
	const failed = (thrown: unknown) => {
		const error =
			thrown instanceof Error
				? thrown
				: new Error(String(thrown), {
						cause: thrown,
					});
		if (expected.length > 0 && !expected.some((type) => error instanceof type)) {
			throw thrown;
		}
		return {
			data: null,
			error: error as Caught<TExpected>,
		};
	};
	const succeeded = (data: TData) => ({
		data,
		error: null,
	});

	if (typeof work !== "function") {
		return Promise.resolve(work).then(succeeded, failed);
	}

	try {
		return succeeded(work());
	} catch (error) {
		return failed(error);
	}
};

interface Settle {
	/**
	 * Settles a promise into an {@link Attempt} instead of rejecting.
	 *
	 * Name the error classes the caller handles and `error` is typed as them;
	 * any other error still rejects. Name none and every error is handed back,
	 * a thrown non-`Error` wrapped in one with the value as its `cause`.
	 *
	 * @example
	 * ```ts
	 * const { data, error } = await attempt(getAnime(id), AnimeNotFoundError);
	 * if (error) {
	 *   return null;
	 * }
	 * ```
	 */
	<TData, TExpected extends ErrorClass[] = []>(
		work: PromiseLike<TData>,
		...expected: TExpected
	): Promise<Attempt<TData, Caught<TExpected>>>;
	/**
	 * Calls synchronous `work`, such as `JSON.parse`, and returns its result as an
	 * {@link Attempt} instead of throwing, as the promise form does. Asynchronous
	 * work is passed as its promise instead.
	 */
	<TData, TExpected extends ErrorClass[] = []>(
		work: () => TData extends PromiseLike<unknown> ? never : TData,
		...expected: TExpected
	): Attempt<TData, Caught<TExpected>>;
}

export const attempt = settle as Settle;

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

export * from "./time";
