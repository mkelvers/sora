import { CoreError } from "../../errors";

/** The proxied upstream could not be fetched. Retryable. */
export class StreamUpstreamError extends CoreError {
	readonly status: number | null;

	constructor(message: string, status: number | null, options?: ErrorOptions) {
		super("UPSTREAM_UNAVAILABLE", message, options);
		this.name = "StreamUpstreamError";
		this.status = status;
	}
}
