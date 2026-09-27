import { anilist, currentAniListPriority } from "../anilist/client";
import { FranchiseEntriesDocument, type FranchiseEntryFragment, type MediaRelation } from "../anilist/graphql.generated";
import { fuzzyDate } from "../catalog/models/text";
import { UpstreamUnavailableError } from "../errors";
import { hour } from "../time";
import type { MatchSubject } from "./matching";

/** An AniList entry as loaded for franchise grouping. */
export type FranchiseEntry = FranchiseEntryFragment;

/**
 * Relations that stay inside one franchise.
 *
 * `CHARACTER` (crossovers), `ADAPTATION`, and `SOURCE` lead outside it and
 * are never followed.
 */
const franchiseRelations = new Set<MediaRelation>([
  "SEQUEL",
  "PREQUEL",
  "PARENT",
  "SIDE_STORY",
  "SPIN_OFF",
  "ALTERNATIVE",
  "SUMMARY",
  "COMPILATION",
  "CONTAINS",
  "OTHER"
]);

/** How long a loaded entry is reused, matching the catalog's card freshness. */
const entryLifetimeMs = hour;

/** How many AniList 429s one batch waits out before failing. */
const rateLimitRetries = 2;

/** Bounds {@link recentEntries}; the oldest entries are evicted first. */
const recentEntryLimit = 5_000;

/**
 * Entries loaded recently by this process, by AniList ID.
 *
 * Walking a franchise and resolving each entry's prequels request the same
 * entries in many different combinations. Snapshots are keyed by the exact
 * batch, so without this each combination would cost an AniList request
 * against a limit of 30–90 per minute.
 */
const recentEntries = new Map<
  number,
  {
    entry: FranchiseEntry | null;
    loadedAt: number;
  }
>();

/**
 * Loads franchise entries by AniList ID in batches of 50. Each batch also
 * brings the entries related to those asked for, which are kept for later
 * calls, so walking a franchise costs one request for every two steps.
 *
 * Unknown, adult, and music-video IDs are left out: music videos are not
 * watchable series, and adult media is never served.
 */
export async function loadEntries(ids: Iterable<number>): Promise<Map<number, FranchiseEntry>> {
  const wanted = [...new Set(ids)];
  const missing = wanted.filter((id) => {
    const recent = recentEntries.get(id);
    return !recent || recent.loadedAt + entryLifetimeMs <= Date.now();
  });
  if (missing.length > 0) {
    await loadTogether(missing);
  }

  const entries = new Map<number, FranchiseEntry>();
  for (const id of wanted) {
    const entry = recentEntries.get(id)?.entry;
    if (entry) {
      entries.set(id, entry);
    }
  }

  return entries;
}

/** How long IDs asked for at about the same time are gathered into one request. */
const gatherMs = 25;

/** IDs being gathered into one request, by the AniList priority they are asked at. */
const gathering = new Map<number, { ids: Set<number>; loaded: Promise<void> }>();

/**
 * Loads `ids` into {@link recentEntries} together with any others asked for
 * at the same priority within {@link gatherMs}. Layouts that start at once,
 * as several a search found do, then share requests rather than each asking
 * for its own entry. Priorities are gathered apart, so a viewer's IDs never
 * wait in a background request.
 */
function loadTogether(ids: readonly number[]): Promise<void> {
  const priority = currentAniListPriority();
  let batch = gathering.get(priority);
  if (!batch) {
    const gathered = new Set<number>();
    batch = {
      ids: gathered,
      loaded: Bun.sleep(gatherMs).then(() => {
        gathering.delete(priority);
        return fetchAndRemember([...gathered].sort((left, right) => left - right));
      })
    };
    gathering.set(priority, batch);
  }

  for (const id of ids) {
    batch.ids.add(id);
  }

  return batch.loaded;
}

/** Fetches entries in pages of 50, AniList's cap, and remembers them and their neighbours. */
async function fetchAndRemember(ids: readonly number[]) {
  for (let offset = 0; offset < ids.length; offset += 50) {
    const batch = ids.slice(offset, offset + 50);
    const { Page } = await fetchEntries(batch);

    const loaded = new Map<number, FranchiseEntry>();
    for (const media of Page?.media ?? []) {
      if (!media) {
        continue;
      }

      const { neighbours, ...entry } = media;
      if (isServed(entry)) {
        loaded.set(entry.id, entry);
      }

      // The next step of a walk, and the prequels matching looks up, then
      // need no request of their own.
      for (const edge of neighbours?.edges ?? []) {
        const neighbour = edge?.node;
        if (neighbour?.type === "ANIME" && !batch.includes(neighbour.id)) {
          const { type: _type, ...neighbourEntry } = neighbour;
          remember(neighbour.id, isServed(neighbourEntry) ? neighbourEntry : null);
        }
      }
    }

    for (const id of batch) {
      remember(id, loaded.get(id) ?? null);
    }
  }
}

/**
 * Fetches one batch, waiting out AniList rate limits.
 *
 * Walking a franchise needs a burst of requests and AniList often runs at
 * its degraded limit of 30 per minute. The AniList client pauses its queue
 * for the requested delay after a 429, so retrying simply waits in line.
 */
async function fetchEntries(ids: number[]) {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await anilist(
        FranchiseEntriesDocument,
        {
          ids,
          perPage: ids.length
        },
        {
          maxAgeMs: hour
        }
      );
    } catch (cause) {
      const isRateLimited = cause instanceof UpstreamUnavailableError && cause.retryAfterMs !== null;
      if (!isRateLimited || attempt >= rateLimitRetries) {
        throw cause;
      }
    }
  }
}

/** Whether an entry is served at all: adult media and music videos never are. */
function isServed(entry: FranchiseEntry) {
  return !entry.isAdult && entry.format !== "MUSIC";
}

function remember(id: number, entry: FranchiseEntry | null) {
  recentEntries.delete(id);
  recentEntries.set(id, {
    entry,
    loadedAt: Date.now()
  });

  // Maps iterate in insertion order, so the first key is the oldest.
  const oldest = recentEntries.keys().next();
  if (recentEntries.size > recentEntryLimit && !oldest.done) {
    recentEntries.delete(oldest.value);
  }
}

const sequenceRelations = new Set<MediaRelation>([
  "SEQUEL",
  "PREQUEL"
]);

/** IDs of related anime in the same franchise; see {@link franchiseRelations}. */
export function relatedIds(entry: FranchiseEntry) {
  return idsRelatedBy(entry, franchiseRelations);
}

/** IDs of the entry's direct sequels and prequels. */
export function sequenceIds(entry: FranchiseEntry) {
  return idsRelatedBy(entry, sequenceRelations);
}

function idsRelatedBy(entry: FranchiseEntry, relations: ReadonlySet<MediaRelation>) {
  return (entry.relations?.edges ?? []).flatMap((edge) =>
    edge?.node?.type === "ANIME" && edge.relationType && relations.has(edge.relationType) ? [edge.node.id] : []
  );
}

/**
 * Describes an entry in the shape the matching rules compare.
 *
 * @param now - When matching runs, which an entry that has not aired yet cannot have aired before.
 */
export function toMatchSubject(entry: FranchiseEntry, now: Date): MatchSubject {
  const primaryTitles = primaryTitlesOf(entry);
  const synonyms = (entry.synonyms ?? []).filter(
    (synonym): synonym is string => Boolean(synonym) && !primaryTitles.includes(synonym ?? "")
  );

  return {
    format: entry.format === "MANGA" || entry.format === "NOVEL" || entry.format === "ONE_SHOT" ? null : entry.format,
    titles: [
      ...primaryTitles,
      ...new Set(synonyms)
    ],
    primaryTitleCount: primaryTitles.length,
    startDate: entry.startDate ? fuzzyDate(entry.startDate) : null,
    endDate: entry.endDate ? fuzzyDate(entry.endDate) : null,
    episodes: entry.episodes ?? (entry.nextAiringEpisode ? entry.nextAiringEpisode.episode - 1 : null),
    airsFrom: entry.status === "NOT_YET_RELEASED" ? now.toISOString().slice(0, 10) : null,
    durationMinutes: entry.duration
  };
}

/** The entry's distinct English, romaji, and native titles, in that order. */
export function primaryTitlesOf(entry: FranchiseEntry) {
  const titles = [
    entry.title?.english,
    entry.title?.romaji,
    entry.title?.native
  ].filter((title): title is string => Boolean(title));

  return [...new Set(titles)];
}
