import type { z } from "@hono/zod-openapi";
import { attempt } from "@sora/shared";

import { SoraError } from "./error";

/**
 * A route of the API's contract (`route` in this package): what the client
 * needs to call it and to check what it answers with.
 */
export interface Route {
	method: string;
	path: string;
	request?: {
		params?: z.ZodType;
		query?: z.ZodType;
		body?: {
			content: {
				"application/json": {
					schema: z.ZodType;
				};
			};
		};
	};
	responses: Record<
		number,
		{
			description?: string;
			content?: Record<
				string,
				{
					schema: z.ZodType;
				}
			>;
		}
	>;
}

/** A request's `params`, `query`, or `body` as a property of its input, left optional when nothing in it is required. */
type Part<TKey extends string, TValue, TRequired extends boolean = false> = [TValue] extends [never]
	? {}
	: TRequired extends true
		? { [TProperty in TKey]: TValue }
		: {} extends TValue
			? { [TProperty in TKey]?: TValue }
			: { [TProperty in TKey]: TValue };

/**
 * What a route is called with: its path `params`, its `query`, and its JSON
 * `body`, each present only when the route has it, and required unless
 * every part of it is optional.
 *
 * Path and query values are typed as the API reads them, so numbers are
 * numbers and lists are arrays; the client writes them as text.
 */
export type RequestInput<TRoute extends Route> = Part<
	"params",
	TRoute extends { request: { params: infer TParams extends z.ZodType } }
		? z.output<TParams>
		: never
> &
	Part<
		"query",
		TRoute extends { request: { query: infer TQuery extends z.ZodType } } ? z.output<TQuery> : never
	> &
	Part<
		"body",
		TRoute extends {
			request: {
				body: { content: { "application/json": { schema: infer TBody extends z.ZodType } } };
			};
		}
			? z.input<TBody>
			: never,
		true
	>;

/** The body of a route's successful JSON response, as the API's contract says it is, or `never` when it has none. */
type SuccessBody<TRoute extends Route> = {
	[TStatus in keyof TRoute["responses"] & (200 | 201)]: TRoute["responses"][TStatus] extends {
		content: { "application/json": { schema: infer TSchema extends z.ZodType } };
	}
		? z.output<TSchema>
		: never;
}[keyof TRoute["responses"] & (200 | 201)];

/** A successful response's `{ meta, results }`, or `void` for a route that answers with nothing. */
export type RequestBody<TRoute extends Route> = [SuccessBody<TRoute>] extends [never]
	? void
	: SuccessBody<TRoute>;

/** What {@link SoraClient.request} resolves to: the response's `results`. */
export type RequestResults<TRoute extends Route> =
	RequestBody<TRoute> extends { results: infer TResults } ? TResults : RequestBody<TRoute>;

/** What a request accepts after its input. */
export interface RequestOptions {
	/** Aborts the request, for example `AbortSignal.timeout(10_000)`. */
	signal?: AbortSignal;
}

/** A route's input and options as arguments: the input may be left out when none of it is required. */
type Args<TRoute extends Route> =
	{} extends RequestInput<TRoute>
		? [input?: RequestInput<TRoute>, options?: RequestOptions]
		: [input: RequestInput<TRoute>, options?: RequestOptions];

/** An account's credentials for {@link SoraClient.signIn}. */
export interface SignIn {
	email: string;
	password: string;
}

/**
 * A signed-in session. Send `token` with every request that needs an account,
 * as an `Authorization: Bearer <token>` header in {@link SoraClientOptions.headers}.
 */
export interface Session {
	token: string;
	account: {
		id: string;
		name: string;
		email: string;
	};
}

/** How to reach the API. */
export interface SoraClientOptions {
	/** The API's base URL, without the version, such as `https://api.example.com`. */
	baseUrl: string;
	/** Replaces the global `fetch`, for example to add caching or tracing. */
	fetch?: (input: Request | string | URL, init?: RequestInit) => Promise<Response>;
	/** Headers sent with every request. */
	headers?: Record<string, string>;
}

/**
 * A typed client for the Sora API.
 *
 * It calls any route of the API's contract, exported as `route`, with the
 * input that route takes and resolves to what it answers with: both are
 * typed from the contract, and the response is checked against it, so a
 * response that does not match is an error rather than a wrong value.
 * Every field is in snake_case, as the API spells it. A failed request
 * throws {@link SoraError}; an aborted one rejects with the signal's
 * reason, such as a `TimeoutError`.
 *
 * @example
 * ```ts
 * const sora = new SoraClient({ baseUrl: "http://localhost:4000" });
 *
 * const results = await sora.request(route.searchSeries, { query: { q: "Frieren" } });
 * const listing = await sora.requestWithMeta(route.listEpisodes, {
 *   params: { series_id: results[0].id },
 * });
 * listing.results;
 * ```
 */
export class SoraClient {
	readonly #options: SoraClientOptions;

	constructor(options: SoraClientOptions) {
		this.#options = {
			...options,
			baseUrl: options.baseUrl.replace(/\/+$/, ""),
		};
	}

	/**
	 * Calls a route and resolves to the `results` of its response, or to
	 * nothing for a route that answers with none.
	 *
	 * @throws {@link SoraError} when the API answers with an error, or with
	 *   a body that does not match the contract (code `INVALID_RESPONSE`).
	 */
	async request<TRoute extends Route>(
		route: TRoute,
		...[input, options]: Args<TRoute>
	): Promise<RequestResults<TRoute>> {
		const body = await this.requestWithMeta(route, ...([input, options] as Args<TRoute>));
		return (
			body !== undefined && body !== null && typeof body === "object" && "results" in body
				? body.results
				: body
		) as RequestResults<TRoute>;
	}

	/**
	 * Calls a route and resolves to its whole response, `{ meta, results }`:
	 * the meta carries paging, when stream URLs expire, and the like.
	 *
	 * @throws {@link SoraError} as {@link SoraClient.request} does.
	 */
	async requestWithMeta<TRoute extends Route>(
		route: TRoute,
		...[input, options]: Args<TRoute>
	): Promise<RequestBody<TRoute>> {
		const { params, query, body } = (input ?? {}) as {
			params?: Record<string, unknown>;
			query?: Record<string, unknown>;
			body?: unknown;
		};
		const url = new URL(
			`${this.#options.baseUrl}/v1${route.path.replace(/\{(\w+)\}/g, (_, name: string) =>
				encodeURIComponent(String(params?.[name])),
			)}`,
		);
		for (const [name, value] of Object.entries(query ?? {})) {
			if (value !== undefined && value !== null) {
				// A list is comma-separated, and a null in one is how the API spells "none".
				url.searchParams.set(
					name,
					Array.isArray(value) ? value.map((item) => item ?? "none").join(",") : String(value),
				);
			}
		}

		const response = await (this.#options.fetch ?? fetch)(url, {
			method: route.method.toUpperCase(),
			headers: {
				...this.#options.headers,
				...(body !== undefined && {
					"Content-Type": "application/json",
				}),
			},
			body: body === undefined ? undefined : JSON.stringify(body),
			signal: options?.signal,
		});
		if (!response.ok) {
			throw await SoraError.from(response);
		}

		const schema = route.responses[response.status]?.content?.["application/json"]?.schema;
		if (!schema) {
			return undefined as RequestBody<TRoute>;
		}

		const json = await attempt(response.json());
		const parsed = json.error ? null : schema.safeParse(json.data);
		if (!parsed?.success) {
			throw new SoraError(
				`The API's answer to ${route.method.toUpperCase()} ${route.path} does not match its contract${
					parsed ? `: ${parsed.error.message}` : ""
				}`,
				{
					status: response.status,
					code: "INVALID_RESPONSE",
					retryAfterSeconds: null,
				},
			);
		}

		return parsed.data as RequestBody<TRoute>;
	}

	/**
	 * Signs an account in.
	 *
	 * @throws {@link SoraError} with code `INVALID_EMAIL_OR_PASSWORD` when the
	 *   credentials are wrong.
	 */
	async signIn(credentials: SignIn, options?: RequestOptions): Promise<Session> {
		const response = await this.#auth("sign-in/email", credentials, options);
		const signedIn = (await response.json()) as {
			token: string;
			user: Session["account"];
		};

		return {
			token: signedIn.token,
			account: {
				id: signedIn.user.id,
				name: signedIn.user.name,
				email: signedIn.user.email,
			},
		};
	}

	/** Ends the session this client's token belongs to. */
	async signOut(options?: RequestOptions): Promise<void> {
		await this.#auth("sign-out", {}, options);
	}

	/**
	 * Calls one of Better Auth's endpoints under `/v1/auth`, which answer outside the `{ meta, results }` envelope.
	 *
	 * @throws {@link SoraError} when the endpoint answers with an error.
	 */
	async #auth(path: string, body: object, options: RequestOptions | undefined): Promise<Response> {
		const response = await (this.#options.fetch ?? fetch)(
			`${this.#options.baseUrl}/v1/auth/${path}`,
			{
				method: "POST",
				headers: {
					// Better Auth checks the origin of requests that look like a browser's,
					// as Node's fetch does; this client speaks for the API's own origin.
					// Browsers ignore it and send their own.
					Origin: new URL(this.#options.baseUrl).origin,
					...this.#options.headers,
					"Content-Type": "application/json",
				},
				body: JSON.stringify(body),
				signal: options?.signal,
			},
		);

		if (!response.ok) {
			throw await SoraError.from(response);
		}

		return response;
	}
}
