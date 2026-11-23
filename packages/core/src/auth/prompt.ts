import { createInterface } from "node:readline/promises";
import { Writable } from "node:stream";

/** Where a password is read from: a terminal, or piped standard input. */
export class Prompt {
	readonly #input: NodeJS.ReadStream;
	readonly #output: NodeJS.WriteStream;

	constructor(input: NodeJS.ReadStream, output: NodeJS.WriteStream) {
		this.#input = input;
		this.#output = output;
	}

	/**
	 * The password: the first line of the input when `piped`, otherwise asked
	 * for in the terminal without echoing it. `null` when the input ends
	 * before a line, or the question is cancelled.
	 */
	password(piped: boolean): Promise<string | null> {
		if (piped) {
			return this.#line();
		}

		return this.#ask();
	}

	async #line() {
		const reader = createInterface({
			crlfDelay: Number.POSITIVE_INFINITY,
			input: this.#input,
		});

		const first = await reader[Symbol.asyncIterator]().next();
		reader.close();

		if (first.done === true) {
			return null;
		}

		return first.value;
	}

	async #ask() {
		// Readline handles editing, but its output is discarded so typed characters stay hidden.
		const output = new Writable({
			write(_chunk, _encoding, finish) {
				finish();
			},
		});

		const reader = createInterface({
			input: this.#input,
			output,
			terminal: true,
		});

		const controller = new AbortController();
		reader.once("SIGINT", () => controller.abort());
		reader.once("close", () => controller.abort());
		this.#output.write("Password: ");

		return await reader
			.question("", {
				signal: controller.signal,
			})
			.catch((error) => {
				if (!controller.signal.aborted) {
					throw error;
				}

				return null;
			})
			.finally(() => {
				reader.close();
				output.destroy();
				this.#output.write("\n");
			});
	}
}
