import { CoreError } from "./core-error";

/** Caller-supplied input failed validation. */
export class InvalidInputError extends CoreError {
	constructor(message: string, options?: ErrorOptions) {
		super("INVALID_INPUT", message, options);
		this.name = "InvalidInputError";
	}
}
