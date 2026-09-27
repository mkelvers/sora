import { beforeEach, expect, mock, test } from "bun:test";

/** The `ids` of each FranchiseEntries request, in order. */
const requests: number[][] = [];
let priority = 10;

/** An AniList entry with `relatedIds` as its neighbours, loaded in full. */
function media(id: number, relatedIds: number[] = []) {
  const entry = (entryId: number) => ({
    id: entryId,
    title: { romaji: `Entry ${entryId}`, english: null, native: null },
    format: "TV",
    isAdult: false,
    relations: { edges: [] }
  });
  return {
    ...entry(id),
    neighbours: {
      edges: relatedIds.map((related) => ({ node: { type: "ANIME", ...entry(related) } }))
    }
  };
}

mock.module("../anilist/client", () => ({
  currentAniListPriority: () => priority,
  anilist: async (_document: unknown, variables: { ids: number[] }) => {
    requests.push(variables.ids);
    return {
      Page: {
        media: variables.ids.map((id) => media(id, id === 1 ? [2] : []))
      }
    };
  }
}));

const { loadEntries } = await import("./entries");

let nextId = 100;
beforeEach(() => {
  requests.length = 0;
  priority = 10;
});

test("loads the entries layouts ask for at the same time in one request", async () => {
  const [first, second] = [nextId++, nextId++];

  const [left, right] = await Promise.all([loadEntries([first]), loadEntries([second])]);

  expect(requests).toEqual([[first, second]]);
  expect(left.has(first)).toBe(true);
  expect(right.has(second)).toBe(true);
});

test("never mixes priorities in one request, so a viewer's entries do not wait at a background job's", async () => {
  const background = nextId++;
  const viewer = nextId++;

  const backgroundLoad = loadEntries([background]);
  priority = -7;
  const viewerLoad = loadEntries([viewer]);
  await Promise.all([backgroundLoad, viewerLoad]);

  expect(requests.toSorted((left, right) => (left[0] ?? 0) - (right[0] ?? 0))).toEqual([[background], [viewer]]);
});

test("answers a later request for a neighbour from the one that brought it", async () => {
  await loadEntries([1]);
  const neighbours = await loadEntries([2]);

  expect(requests).toEqual([[1]]);
  expect(neighbours.get(2)?.id).toBe(2);
});
