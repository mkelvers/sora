/** Durations in milliseconds, for cache lifetimes and timeouts. */
export const second = 1_000;
export const minute = 60 * second;
export const hour = 60 * minute;
export const day = 24 * hour;

/**
 * How long a `Retry-After` header asks to wait, in milliseconds, whether it
 * holds seconds or an HTTP date. `null` when it is absent or unreadable.
 */
export function parseRetryAfter(header: string | null, now = Date.now()) {
	if (header === null || header.trim() === "") {
		return null;
	}

	const seconds = Number(header);
	if (Number.isFinite(seconds)) {
		return seconds >= 0 ? seconds * second : null;
	}

	const date = new Date(header).getTime();
	return Number.isNaN(date) ? null : Math.max(0, date - now);
}

/** The `Retry-After` value for a wait in milliseconds: whole seconds, rounded up. */
export function formatRetryAfter(milliseconds: number) {
	return String(Math.ceil(milliseconds / second));
}
