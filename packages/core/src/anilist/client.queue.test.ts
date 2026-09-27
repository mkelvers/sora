import { afterAll, expect, mock, test } from "bun:test";

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

const {
  anilist,
  viewerWaitingPriority,
  withAniListPriority,
} = await import("./client");

/** The `id` variable of each request AniList received, in the order they were sent. */
const sent: number[] = [];
/** When each request was sent. */
const sentAt: number[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
  sent.push((JSON.parse(String(init?.body)) as {
    variables: {
      id: number;
    };
  }).variables.id);
  sentAt.push(performance.now());
  return new Response(JSON.stringify({
    data: {
      Media: null,
    },
  }), {
    headers: {
      "x-ratelimit-limit": "30",
      "x-ratelimit-remaining": "29",
    },
  });
}) as typeof fetch;

afterAll(() => {
  globalThis.fetch = realFetch;
});

const document = "query Media($id: Int!) { Media(id: $id) { id } }" as unknown as TypedDocumentString<unknown, {
  id: number;
}>;
const fetchMedia = (id: number) => anilist(document, {
  id,
}, {
  maxAgeMs: 0,
});
const background = 10;

test("sends a request a viewer joins ahead of background work queued before it", async () => {
  const first = withAniListPriority(background, () => fetchMedia(1));
  const second = withAniListPriority(background, () => fetchMedia(2));
  const shared = withAniListPriority(background, () => fetchMedia(3));
  // The same request, asked for by a search while the background copy still waits its turn.
  const viewer = withAniListPriority(viewerWaitingPriority, () => fetchMedia(3));

  await Promise.all([first, second, shared, viewer]);

  expect(sent).toEqual([1, 3, 2]);
}, 15_000);

test("spaces background requests to the limit AniList reports, not the normal one", async () => {
  sent.length = 0;
  sentAt.length = 0;

  await withAniListPriority(background, () => fetchMedia(4));
  await withAniListPriority(background, () => fetchMedia(5));

  // Each response says 30 a minute: 2.1 s apart, where the normal 90 would allow 767 ms.
  expect((sentAt[1] ?? 0) - (sentAt[0] ?? 0)).toBeGreaterThanOrEqual(2_000);
}, 15_000);
