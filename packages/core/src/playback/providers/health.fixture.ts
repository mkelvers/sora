import { summarize } from "./health";
import type { OperationRow } from "./health";

/** When the tests take place. */
export const now = new Date("2026-09-25T16:40:00Z");

/** The start of the hour `hours` before {@link now}. */
export const hoursAgo = (hours: number) => new Date(Date.UTC(2026, 8, 25, 16 - hours));

/** A row for `provider`'s `operation` with no calls and nothing on record, overridden by `fields`. */
export const row = (
	provider: string,
	operation: string,
	fields: Partial<OperationRow>,
): OperationRow => ({
	durationMs: 0,
	empty: 0,
	failed: 0,
	lastError: null,
	lastErrorAt: null,
	lastOkHour: null,
	ok: 0,
	operation,
	provider,
	recentCalls: 0,
	...fields,
});

/** The status a provider with `rows` is summarized to. */
export const statusOf = (rows: OperationRow[]) => summarize(["anikoto"], rows, now)[0]?.status;
