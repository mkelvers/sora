import { expect, test } from "bun:test";

import { aniListPriority, createAniListClient, viewerWaitingPriority } from "./client";
import { TypedDocumentString } from "./graphql.generated";

/** The `id` variable of each request AniList received, in the order they were sent. */
const sent: number[] = [];
/** When each request was sent. */
const sentAt: number[] = [];
async function respond(_input: string, init: RequestInit) {
	sent.push(
		(
			JSON.parse(String(init.body)) as {
				variables: {
					id: number;
				};
			}
		).variables.id,
	);
	sentAt.push(performance.now());
	return new Response(
		JSON.stringify({
			data: {
				Media: null,
			},
		}),
		{
			headers: {
				"x-ratelimit-limit": "30",
				"x-ratelimit-remaining": "29",
			},
		},
	);
}

const { anilist } = createAniListClient({
	fetch: respond,
	store: {
		find: async () => {},
		save: async () => {},
	},
});

const document = new TypedDocumentString<unknown, { id: number }>(
	"query Media($id: Int!) { Media(id: $id) { id } }",
);
const fetchMedia = (id: number) =>
	anilist(
		document,
		{
			id,
		},
		{
			maxAgeMs: 0,
		},
	);
const background = 10;

test("sends a request a viewer joins ahead of background work queued before it", async () => {
	const first = aniListPriority.run(background, () => fetchMedia(1));
	const second = aniListPriority.run(background, () => fetchMedia(2));
	const shared = aniListPriority.run(background, () => fetchMedia(3));
	// The same request, asked for by a search while the background copy still waits its turn.
	const viewer = aniListPriority.run(viewerWaitingPriority, () => fetchMedia(3));

	await Promise.all([first, second, shared, viewer]);

	expect(sent).toEqual([1, 3, 2]);
}, 15_000);

test("spaces background requests to the limit AniList reports, not the normal one", async () => {
	sent.length = 0;
	sentAt.length = 0;

	await aniListPriority.run(background, () => fetchMedia(4));
	await aniListPriority.run(background, () => fetchMedia(5));

	// Each response says 30 a minute: 2.1 s apart, where the normal 90 would allow 767 ms.
	expect((sentAt[1] ?? 0) - (sentAt[0] ?? 0)).toBeGreaterThanOrEqual(2000);
}, 15_000);
