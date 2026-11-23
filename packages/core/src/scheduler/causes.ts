/** An error with the errors that caused it. */
export class Causes {
	readonly #error: Error;

	constructor(error: Error) {
		this.#error = error;
	}

	/**
	 * The error with the message of each error behind it added to its own,
	 * one per line, and their stacks to its stack, or the error itself when
	 * nothing caused it. graphile-worker logs and stores only a failed job's
	 * message and stack, so the cause, such as the Postgres error behind
	 * drizzle's "Failed query", would otherwise be lost.
	 */
	get described(): Error {
		const error = this.#error;
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
				.map((link, index) => {
					if (index === 0) {
						return link.message;
					}

					return `Caused by ${link.name}: ${link.message}`;
				})
				.join("\n"),
			{
				cause: error,
			},
		);

		described.stack = chain
			.map((link) => link.stack ?? `${link.name}: ${link.message}`)
			.join("\nCaused by ");

		return described;
	}
}
