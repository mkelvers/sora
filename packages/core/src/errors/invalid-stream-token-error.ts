import { CoreError } from "./core-error";

/** A stream proxy token is malformed, forged, or expired. */
export class InvalidStreamTokenError extends CoreError {
	constructor(reason: string) {
		super("INVALID_STREAM_TOKEN", reason);
		this.name = "InvalidStreamTokenError";
	}
}
