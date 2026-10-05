import { timingSafeEqual } from "node:crypto";

import { config } from "../../config";

/**
 * Whether `supplied` is the key the web app sends, which only it knows.
 *
 * The API serves playback and streams to requests that carry it, so media is
 * reachable through the web app and nothing else, however many accounts
 * exist.
 */
export function isWebClientKey(supplied: string | undefined) {
	const given = Buffer.from(supplied ?? "");
	const expected = Buffer.from(config.webClientKey);
	return given.length === expected.length && timingSafeEqual(given, expected);
}
