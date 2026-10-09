import { createHash } from "node:crypto";

import { attempt } from "@sora/shared";
import { eq } from "drizzle-orm";
import type { z } from "zod";

import { config } from "../config";
import { db } from "../database/client";
import { tmdbResponse } from "../database/schema";
import { UpstreamUnavailableError } from "../errors";
import { InFlight } from "../in-flight";
import type { TmdbEndpoints } from "./api.generated";

const endpoint = "https://api.themoviedb.org/3";

/**
 * Minimum spacing between the starts of upstream requests from this process.
 *
 * TMDB allows roughly 40 requests per second per IP. Requests may overlap;
 * only their start times are spaced, which keeps a franchise lookup that
 * needs dozens of calls fast without bursting past the limit.
 */
const requestSpacingMs = 30;

const requestTimeoutMs = 10_000;

/** A 429 is retried this many times before giving up. */
const rateLimitRetries = 2;

/** Freshness policy for one TMDB request. */
export interface TmdbRequestOptions {
	/**
	 * How old a stored response may be and still be served without asking
	 * TMDB again, in milliseconds.
	 */
	maxAgeMs: number;
	/**
	 * Whether the response is stored (see `tmdbResponse`). A request that never
	 * repeats, such as one carrying a nonce, should not be.
	 *
	 * @defaultValue true
	 */
	store?: boolean;
}

type Params = Record<string, unknown>;

/** A path template with each `{name}` filled by the type of that path parameter. */
type Filled<
	Template extends string,
	Path extends Params,
> = Template extends `${infer Head}{${infer Name}}${infer Tail}`
	? `${Head}${Path[Name] extends number ? number : string}${Filled<Tail, Path>}`
	: Template;

/** Every TMDB v3 GET path, as a type that accepts the paths built from it. */
export type TmdbPath = {
	[Template in keyof TmdbEndpoints & string]: Filled<Template, TmdbEndpoints[Template]["path"]>;
}[keyof TmdbEndpoints & string];

/** The query parameters TMDB documents for `Path`. */
export type TmdbQuery<Path extends TmdbPath> = {
	[Template in keyof TmdbEndpoints & string]: Path extends Filled<
		Template,
		TmdbEndpoints[Template]["path"]
	>
		? TmdbEndpoints[Template]["query"]
		: never;
}[keyof TmdbEndpoints & string];

let nextRequestAt = 0;
const inFlight = new InFlight<string, unknown>();

/**
 * Fetches a TMDB v3 resource with request coalescing and rate limiting,
 * storing the response (see `tmdbResponse`), and validates it against
 * `schema`.
 *
 * A stored response younger than `maxAgeMs` is returned without a network
 * call. Identical concurrent requests share one upstream call. When TMDB is
 * unavailable, an older stored response is served rather than failing.
 *
 * @returns The validated response, or `null` when TMDB answers 404.
 * @throws {@link UpstreamUnavailableError} when TMDB fails or returns data
 *   that does not match `schema`, and no usable response is stored.
 *
 * @example
 * ```ts
 * const show = await tmdb("/tv/82684", {}, TvShowSchema, { maxAgeMs: day });
 * // await tmdb("/tv/82684/episodes", {}, ...) does not compile: no such endpoint
 * ```
 */
export async function tmdb<Path extends TmdbPath, TSchema extends z.ZodType>(
	path: Path,
	query: TmdbQuery<Path>,
	schema: TSchema,
	options: TmdbRequestOptions,
): Promise<z.infer<TSchema> | null> {
	const url = new URL(`${endpoint}${path}`);
	for (const [name, value] of Object.entries(query as Params).sort(([left], [right]) =>
		left.localeCompare(right),
	)) {
		if (value !== undefined) {
			url.searchParams.set(name, String(value));
		}
	}

	const key = createHash("sha256").update(url.toString()).digest("hex");
	const [stored] =
		options.store === false
			? []
			: await db.select().from(tmdbResponse).where(eq(tmdbResponse.key, key)).limit(1);

	const kept = stored ? schema.safeParse(stored.data) : null;
	if (stored && kept?.success && stored.fetchedAt.getTime() + options.maxAgeMs > Date.now()) {
		return kept.data;
	}

	const { data, error } = await attempt(
		inFlight.run(key, () => fetchAndStore(key, path, url, options)),
		UpstreamUnavailableError,
	);
	if (error) {
		if (kept?.success) {
			return kept.data;
		}
		throw error;
	}

	if (data === null) {
		return null;
	}

	const parsed = schema.safeParse(data);
	if (!parsed.success) {
		throw new UpstreamUnavailableError(`TMDB returned an unexpected response for ${path}`, {
			retryAfterMs: null,
			cause: parsed.error,
		});
	}

	return parsed.data;
}

/** Fetches one resource and stores it unless told not to. A 404 is returned as `null` and not stored. */
async function fetchAndStore(key: string, path: string, url: URL, options: TmdbRequestOptions) {
	const data = await execute(url);
	if (data === null || options.store === false) {
		return data;
	}

	const values = {
		path,
		data,
		fetchedAt: new Date(),
	};

	await db
		.insert(tmdbResponse)
		.values({
			key,
			...values,
		})
		.onConflictDoUpdate({
			target: tmdbResponse.key,
			set: values,
		});

	return data;
}

async function execute(url: URL): Promise<unknown> {
	for (let tries = 0; ; tries += 1) {
		await nextSlot();

		const response = await attempt(
			fetch(url, {
				headers: {
					Accept: "application/json",
					Authorization: `Bearer ${config.tmdbReadAccessToken}`,
				},
				signal: AbortSignal.timeout(requestTimeoutMs),
			}),
		);
		if (response.error) {
			throw new UpstreamUnavailableError("TMDB could not be reached", {
				retryAfterMs: null,
				cause: response.error,
			});
		}

		if (response.data.status === 429) {
			const retryAfterMs = retryAfter(response.data) ?? 2_000;
			// Pause every request from this process, not just this one.
			nextRequestAt = Math.max(nextRequestAt, Date.now() + retryAfterMs);
			if (tries < rateLimitRetries) {
				continue;
			}

			throw new UpstreamUnavailableError("TMDB rate limit reached", {
				retryAfterMs,
			});
		}

		if (response.data.status === 404) {
			return null;
		}

		if (!response.data.ok) {
			throw new UpstreamUnavailableError(
				`TMDB returned ${response.data.status} for ${url.pathname}`,
				{
					retryAfterMs: retryAfter(response.data),
				},
			);
		}

		const body = await attempt(response.data.json());
		if (body.error) {
			throw new UpstreamUnavailableError(
				`TMDB returned a response for ${url.pathname} that is not JSON`,
				{
					retryAfterMs: null,
					cause: body.error,
				},
			);
		}
		return body.data;
	}
}

/** Waits until this request may start, reserving the following slot for the next caller. */
async function nextSlot() {
	const startAt = Math.max(Date.now(), nextRequestAt);
	nextRequestAt = startAt + requestSpacingMs;

	const wait = startAt - Date.now();
	if (wait > 0) {
		await Bun.sleep(wait);
	}
}

function retryAfter(response: Response) {
	const seconds = Number(response.headers.get("Retry-After"));
	return Number.isFinite(seconds) && seconds > 0 ? seconds * 1_000 : null;
}
