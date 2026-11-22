import { setTimeout as sleep } from "node:timers/promises";

import { minute, parseRetryAfter, second } from "@sora/shared";
import { z } from "zod";

/** The award nominations IMDb lists for some titles, by IMDb ID. */
export class Nominations {
	static readonly #nominations = z.object({
		awardNominations: z.object({
			edges: z.array(
				z.object({
					node: z.object({
						award: z.object({
							event: z.object({
								text: z.string(),
							}),
							year: z.number().int().nullable(),
						}),
						isWinner: z.boolean(),
					}),
				}),
			),
		}),
	});

	static readonly #response = z.object({
		data: z.record(z.string(), Nominations.#nominations.nullable()).nullable(),
		errors: z
			.array(
				z.object({
					message: z.string(),
				}),
			)
			.optional(),
	});

	readonly #ids: readonly string[];

	constructor(ids: readonly string[]) {
		this.#ids = ids;
	}

	/**
	 * One IMDb GraphQL query for the award nominations of each of the IDs IMDb
	 * knows, by the ID asked for, which IMDb may have merged into another.
	 *
	 * @throws {Error} when IMDb fails or answers with errors alone.
	 */
	async fetch() {
		/**
		 * The most nominations IMDb returns for one title. Only long-running
		 * Western shows have more, and an anime title rarely has more than a hundred.
		 */
		const perTitle = 250;

		/** It names the app, never whoever runs it. */
		const imdbHeaders = {
			"User-Agent": "Sora/1.0 (self-hosted anime catalogue)",
			"content-type": "application/json",
			"x-imdb-client-name": "imdb-web-next",
		};

		/**
		 * IMDb's GraphQL API, which its own site reads. It is not offered to others
		 * and has no documentation, so a change on IMDb's side shows here first as a
		 * schema error; nothing else depends on it.
		 */
		const imdbEndpoint = "https://caching.graphql.imdb.com/";

		/** A 429 from IMDb is waited out and retried this many times. */
		const imdbRetries = 3;

		/** How long IMDb requests wait after the one before. */
		const imdbSpacingMs = second;

		const titles = this.#ids
			.map(
				(id, index) =>
					`t${index}: title(id: ${JSON.stringify(id)}) { awardNominations(first: ${perTitle}) { edges { node { isWinner award { year event { text } } } } } }`,
			)
			.join(" ");

		const request = async (retries: number): Promise<Response> => {
			await sleep(imdbSpacingMs);

			const response = await fetch(imdbEndpoint, {
				body: JSON.stringify({
					query: `{ ${titles} }`,
				}),
				headers: imdbHeaders,
				method: "POST",
				signal: AbortSignal.timeout(30 * second),
			});

			if (response.status === 429 && retries > 0) {
				await sleep(parseRetryAfter(response.headers.get("Retry-After")) ?? minute);

				return await request(retries - 1);
			}

			if (!response.ok) {
				throw new Error(`IMDb returned ${response.status}`);
			}

			return response;
		};

		const response = await request(imdbRetries);
		const { data, errors } = Nominations.#response.parse(await response.json());

		if (!data) {
			throw new Error(
				`IMDb answered with errors: ${errors?.map((error) => error.message).join("; ")}`,
			);
		}

		return this.#ids.flatMap((id, index) => {
			const title = data[`t${index}`];

			if (title) {
				return [[id, title] as const];
			}

			return [];
		});
	}
}
