import type { HttpTransport } from "anime-sdk";

import { second } from "../../time";

/** The longest a provider's `Retry-After` may make a request wait. */
const maximumRetryAfterSeconds = 10;

/**
 * Plain `fetch` for provider requests, with `Retry-After` capped.
 *
 * `anime-sdk`'s default transport falls back to a `curl` shell command built
 * from the request URL, which runs whatever a provider's response put in an
 * ID, such as `$(...)`. This one never starts a process. `anime-sdk` also
 * sleeps for as long as `Retry-After` says, so a provider answering 429 with
 * an hour would hold playback for an hour; the header is cut to
 * {@link maximumRetryAfterSeconds}.
 */
export const providerTransport: HttpTransport = {
	async fetch(url, init) {
		const response = await fetch(url, init);
		const retryAfter = response.headers.get("Retry-After");
		if (retryAfter === null) {
			return response;
		}

		const seconds = Number.isNaN(Number(retryAfter))
			? (Date.parse(retryAfter) - Date.now()) / second
			: Number(retryAfter);
		if (!(seconds > maximumRetryAfterSeconds)) {
			return response;
		}

		const headers = new Headers(response.headers);
		headers.set("Retry-After", String(maximumRetryAfterSeconds));
		return new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});
	},
};
