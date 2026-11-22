import { expect, mock, test } from "bun:test";

import { z } from "zod";

import { createAniListClient } from "./client";
import { TypedDocumentString } from "./graphql.generated";

const schema = z.object({
	Media: z
		.object({
			id: z.number(),
		})
		.nullable(),
});

const document = new TypedDocumentString<z.output<typeof schema>, { id: number }>(
	"query Media($id: Int!) { Media(id: $id) { id } }",
);

test("returns a fresh cached response only after validating its result", async () => {
	const { anilist } = createAniListClient({
		fetch: () => Promise.reject(new Error("A valid fresh response must not be fetched again")),
		store: {
			find: () =>
				Promise.resolve({
					data: { Media: { id: 123 } },
					fetchedAt: new Date(),
				}),
			save: () => Promise.reject(new Error("A valid fresh response must not be saved again")),
		},
	});

	const result = await anilist(document, { id: 123 }, schema, { maxAgeMs: 60_000 });
	expect(result).toEqual({ Media: { id: 123 } });
});

test("fetches again when a fresh cached result is malformed", async () => {
	const fetcher = mock(() => Promise.resolve(Response.json({ data: { Media: { id: 123 } } })));

	const { anilist } = createAniListClient({
		fetch: fetcher,
		store: {
			find: () =>
				Promise.resolve({
					data: { Media: { id: "invalid" } },
					fetchedAt: new Date(),
				}),
			save: () => Promise.resolve(),
		},
	});

	const result = await anilist(document, { id: 123 }, schema, { maxAgeMs: 60_000 });
	expect(result).toEqual({ Media: { id: 123 } });
	expect(fetcher).toHaveBeenCalledTimes(1);
});
