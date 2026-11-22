import { expect, mock, test } from "bun:test";

import { z } from "zod";

import { UpstreamUnavailableError } from "../errors";
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

test("uses a validated stale result when the upstream request fails", async () => {
	const { anilist } = createAniListClient({
		fetch: () => Promise.reject(new Error("upstream unavailable")),
		store: {
			find: () =>
				Promise.resolve({
					data: { Media: { id: 123 } },
					fetchedAt: new Date(0),
				}),
			save: () => Promise.reject(new Error("A failed response must not be saved")),
		},
	});

	const result = await anilist(document, { id: 123 }, schema, { maxAgeMs: 0 });
	expect(result).toEqual({ Media: { id: 123 } });
});

test("rejects a malformed stale result when the upstream request fails", async () => {
	const { anilist } = createAniListClient({
		fetch: () => Promise.reject(new Error("upstream unavailable")),
		store: {
			find: () =>
				Promise.resolve({
					data: { Media: { id: "invalid" } },
					fetchedAt: new Date(0),
				}),
			save: () => Promise.reject(new Error("A failed response must not be saved")),
		},
	});

	await expect(anilist(document, { id: 123 }, schema, { maxAgeMs: 0 })).rejects.toBeInstanceOf(
		UpstreamUnavailableError,
	);
});

test("rejects malformed live results before saving them", async () => {
	const save = mock(() => Promise.resolve());

	const { anilist } = createAniListClient({
		fetch: () => Promise.resolve(Response.json({ data: { Media: { id: "invalid" } } })),
		store: {
			find: async () => {},
			save,
		},
	});

	await expect(anilist(document, { id: 123 }, schema, { maxAgeMs: 0 })).rejects.toBeInstanceOf(
		UpstreamUnavailableError,
	);
	expect(save).not.toHaveBeenCalled();
});
