import { expect, test } from "bun:test";

import { z } from "zod";

import { aniListPriority, connect, viewerWaitingPriority } from "./client";
import { TypedDocumentString } from "./graphql.generated";

/** The `id` variable of each request AniList received, in the order they were sent. */
const sent: number[] = [];

/** When each request was sent. */
const sentAt: number[] = [];

const { anilist } = connect({
	fetch: (_input: string, init: RequestInit) => {
		const { variables } = z
			.object({
				variables: z.object({
					id: z.number(),
				}),
			})
			.parse(JSON.parse(String(init.body)));

		sent.push(variables.id);
		sentAt.push(performance.now());

		return Promise.resolve(
			Response.json(
				{
					data: {
						Media: null,
					},
				},
				{
					headers: {
						"x-ratelimit-limit": "30",
						"x-ratelimit-remaining": "29",
					},
				},
			),
		);
	},
	store: {
		find: async () => {},
		save: async () => {},
	},
});

/** A media AniList is asked for by ID, never served from a stored response. */
class Media {
	static readonly #document = new TypedDocumentString<unknown, { id: number }>(
		"query Media($id: Int!) { Media(id: $id) { id } }",
	);

	readonly #id: number;

	constructor(id: number) {
		this.#id = id;
	}

	fetch() {
		return anilist(
			Media.#document,
			{
				id: this.#id,
			},
			z.unknown(),
			{
				maxAgeMs: 0,
			},
		);
	}
}

const background = 10;

test("sends a request a viewer joins ahead of background work queued before it", async () => {
	const first = aniListPriority.run(background, () => new Media(1).fetch());
	const second = aniListPriority.run(background, () => new Media(2).fetch());
	const shared = aniListPriority.run(background, () => new Media(3).fetch());
	// The same request, asked for by a search while the background copy still waits its turn.
	const viewer = aniListPriority.run(viewerWaitingPriority, () => new Media(3).fetch());

	await Promise.all([first, second, shared, viewer]);

	expect(sent).toEqual([1, 3, 2]);
}, 15_000);

test("spaces background requests to the limit AniList reports, not the normal one", async () => {
	sent.length = 0;
	sentAt.length = 0;

	await aniListPriority.run(background, () => new Media(4).fetch());
	await aniListPriority.run(background, () => new Media(5).fetch());

	// Each response says 30 a minute: 2.1 s apart, where the normal 90 would allow 767 ms.
	expect((sentAt[1] ?? 0) - (sentAt[0] ?? 0)).toBeGreaterThanOrEqual(2000);
}, 15_000);
