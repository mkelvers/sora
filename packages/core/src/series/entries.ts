import { anilist } from "../anilist/client";
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
 * Loads franchise entries by AniList ID in batches of 50.
 *
 * Unknown, adult, and music-video IDs are left out: music videos are not
 * watchable series, and adult media is never served.
 */
export async function loadEntries(ids: Iterable<number>): Promise<Map<number, FranchiseEntry>> {
  const entries = new Map<number, FranchiseEntry>();
  const missing: number[] = [];
  for (const id of new Set(ids)) {
    const recent = recentEntries.get(id);
    if (recent && recent.loadedAt + entryLifetimeMs > Date.now()) {
      if (recent.entry) {
        entries.set(id, recent.entry);
      }
    } else {
      missing.push(id);
    }
  }

  missing.sort((left, right) => left - right);

  // AniList pages are capped at 50 entries.
  for (let offset = 0; offset < missing.length; offset += 50) {
    const batch = missing.slice(offset, offset + 50);
    const { Page } = await fetchEntries(batch);

    const loaded = new Map<number, FranchiseEntry>();
    for (const media of Page?.media ?? []) {
      if (media && !media.isAdult && media.format !== "MUSIC") {
        loaded.set(media.id, media);
      }
    }

    for (const id of batch) {
      const entry = loaded.get(id) ?? null;
      remember(id, entry);
      if (entry) {
        entries.set(id, entry);
      }
    }
  }

  return entries;
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

/** Describes an entry in the shape the matching rules compare. */
export function toMatchSubject(entry: FranchiseEntry): MatchSubject {
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
