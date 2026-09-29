import { afterAll, beforeEach, expect, mock, test } from "bun:test";

import type { TypedDocumentString } from "./graphql.generated";

/** A database with no snapshots that accepts every write. */
const chain: Record<string, unknown> = {};
for (const method of ["select", "from", "where", "insert", "values"]) {
	chain[method] = () => chain;
}
chain.limit = async () => [];
chain.onConflictDoUpdate = async () => undefined;

mock.module("../database/client", () => ({
	db: chain,
}));

const { anilist, loadMediaById, aniListPriority } = await import("./client");

type Pages = Record<string, number[] | number | boolean>;

/** The variables of each request AniList received, in the order they were sent. */
const sent: Pages[] = [];
/** IDs AniList knows nothing about. */
const unknown = new Set([404]);
let failNext = false;
let rateLimitNext = false;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
	const variables = (
		JSON.parse(String(init?.body)) as {
			variables: Pages;
		}
	).variables;
	sent.push(variables);
	if (rateLimitNext) {
		rateLimitNext = false;
		return new Response(
			JSON.stringify({
				errors: [
					{
						message: "Too Many Requests.",
						status: 429,
					},
				],
			}),
			{
				status: 429,
				headers: {
					"Retry-After": "1",
				},
			},
		);
	}

	if (failNext) {
		failNext = false;
		return new Response(
			JSON.stringify({
				errors: [
					{
						message: "Internal error",
					},
				],
			}),
			{
				status: 500,
			},
		);
	}

	const data = Object.fromEntries(
		Object.entries(variables).flatMap(([name, ids]) =>
			Array.isArray(ids)
				? [
						[
							name.replace("ids", "page"),
							{
								media: ids
									.filter((id) => !unknown.has(id))
									.map((id) => ({
										id,
									})),
							},
						],
					]
				: [],
		),
	);
	return new Response(
		JSON.stringify({
			data,
		}),
		{
			headers: {
				"x-ratelimit-limit": "90",
				"x-ratelimit-remaining": "80",
			},
		},
	);
}) as typeof fetch;

afterAll(() => {
	globalThis.fetch = realFetch;
});

beforeEach(() => {
	sent.length = 0;
});

type Media = {
	id: number;
};
type Result = Record<
	string,
	| {
			media: Media[];
	  }
	| undefined
>;

const document =
	"query Media($ids0: [Int!]!) { page0: Page { media(id_in: $ids0) { id } } }" as unknown as TypedDocumentString<
		Result,
		Pages
	>;

/** A loader of `pages` pages, its variables named as the operations name theirs. */
function loader(pages: number) {
	return loadMediaById({
		document,
		pages,
		variables: (split) =>
			Object.fromEntries(
				Array.from(
					{
						length: pages,
					},
					(_, page) => [
						[`ids${page}`, split[page] ?? []],
						...(page > 0 ? [[`with${page}`, (split[page]?.length ?? 0) > 0]] : []),
					],
				).flat(),
			),
		media: (result) => Object.values(result).flatMap((page) => page?.media ?? []),
	});
}

const background = 10;

test("sends the IDs asked for at once in one request", async () => {
	const load = loader(2);

	const [left, right] = await Promise.all([load([3, 1]), load([2])]);

	expect(sent).toEqual([
		{
			ids0: [1, 2, 3],
			ids1: [],
			with1: false,
		},
	]);
	expect([...left.keys()]).toEqual([3, 1]);
	expect([...right.keys()]).toEqual([2]);
});

test("gathers the IDs asked for while a request waits its turn", async () => {
	const load = loader(1);
	await aniListPriority.run(background, () => load([10]));

	// Asked for one after another while the next background request waits out its spacing.
	const later = [aniListPriority.run(background, () => load([11]))];
	await Bun.sleep(20);
	later.push(aniListPriority.run(background, () => load([12])));
	await Promise.all(later);

	expect(sent.map((variables) => variables.ids0)).toEqual([[10], [11, 12]]);
}, 10_000);

test("splits a request over pages of 50, and fills a request before starting another", async () => {
	const load = loader(2);
	const ids = Array.from(
		{
			length: 130,
		},
		(_, index) => 1_000 + index,
	);

	const loaded = await load(ids);

	expect(loaded.size).toBe(130);
	expect(
		sent.map((variables) => [
			(variables.ids0 as number[]).length,
			(variables.ids1 as number[]).length,
			variables.with1,
		]),
	).toEqual([
		[50, 50, true],
		[30, 0, false],
	]);
}, 10_000);

test("sends a batch a viewer joins ahead of background work queued before it", async () => {
	const load = loader(1);
	const other =
		"query Other($id: Int!) { Media(id: $id) { id } }" as unknown as TypedDocumentString<
			unknown,
			{
				id: number;
			}
		>;

	await aniListPriority.run(background, () => load([20]));
	const queuedBefore = aniListPriority.run(background, () =>
		anilist(
			other,
			{
				id: 21,
			},
			{
				maxAgeMs: 0,
			},
		),
	);
	await Bun.sleep(5);
	const shared = aniListPriority.run(background, () => load([22]));
	// The same ID, asked for by a search while the background batch still waits its turn.
	const viewer = load([22]);

	await Promise.all([queuedBefore, shared, viewer]);

	expect(sent.map((variables) => variables.ids0 ?? variables.id)).toEqual([[20], [22], 21]);
}, 15_000);

test("asks for an ID once while it is queued, and leaves out IDs AniList does not have", async () => {
	const load = loader(1);

	const [left, right] = await Promise.all([load([30, 404]), load([30])]);

	expect(sent).toEqual([
		{
			ids0: [30, 404],
		},
	]);
	expect([...left.keys()]).toEqual([30]);
	expect(right.get(30)).toEqual({
		id: 30,
	});
});

test("fails every caller of a request AniList fails, and asks again on the next call", async () => {
	const load = loader(1);
	failNext = true;

	const results = await Promise.allSettled([load([40]), load([41])]);

	expect(results.map((result) => result.status)).toEqual(["rejected", "rejected"]);
	expect((await load([40])).get(40)).toEqual({
		id: 40,
	});
	expect(sent.map((variables) => variables.ids0)).toEqual([[40, 41], [40]]);
}, 10_000);

test("waits out a 429 and asks again, rather than failing its callers", async () => {
	const load = loader(1);
	rateLimitNext = true;

	const [left, right] = await Promise.all([load([50]), load([51])]);

	expect(left.get(50)).toEqual({
		id: 50,
	});
	expect(right.get(51)).toEqual({
		id: 51,
	});
	expect(sent.map((variables) => variables.ids0)).toEqual([
		[50, 51],
		[50, 51],
	]);
}, 10_000);
