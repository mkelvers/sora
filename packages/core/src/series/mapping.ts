import { eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { tmdbMapping } from "../database/schema";
import { day } from "../time";
import { getShow, searchMovies, searchShows } from "../tmdb/resources";
import { loadEntries, primaryTitlesOf, toMatchSubject, type FranchiseEntry } from "./entries";
import {
  bestSimilarity,
  placeAsMovie,
  placeInShow,
  type EpisodeLink,
  type MatchSubject,
  type Placement,
  type ShowCandidate,
  type TmdbEpisodeRef
} from "./matching";

/** A stored AniList-to-TMDB mapping; `tmdbId` is `null` when no match was found. */
export type TmdbMapping = typeof tmdbMapping.$inferSelect;

const EpisodeLinksSchema = z.array(
  z.object({
    anilistEpisode: z.number().int(),
    seasonNumber: z.number().int(),
    episodeNumber: z.number().int()
  })
);

/** A finished entry's mapping is reused for a month before being re-verified. */
const finishedMappingLifetimeMs = 30 * day;

/**
 * Airing entries gain episodes, and unmatched entries may appear on TMDB
 * later, so both are re-checked daily.
 */
const volatileMappingLifetimeMs = day;

/** How many searched shows are loaded in full per entry, best title matches first. */
const searchedShowLimit = 4;

/** Search results considered per query. */
const resultsPerQuery = 5;

const inFlight = new Map<number, Promise<TmdbMapping>>();

/**
 * Resolves where an AniList entry lives on TMDB, using the stored mapping
 * while it is still valid.
 *
 * The entry's prequel and parent are resolved first, because a sequel is
 * usually a later season of the show its prequel maps to, and an OVA is
 * usually a special of its parent's show. Candidate shows and movies come
 * from those mappings and from TMDB title searches; {@link placeInShow} and
 * {@link placeAsMovie} decide between them.
 *
 * @throws {@link UpstreamUnavailableError} when AniList or TMDB fail.
 */
export function resolveMapping(entry: FranchiseEntry): Promise<TmdbMapping> {
  return resolve(entry, new Set());
}

async function resolve(entry: FranchiseEntry, resolving: ReadonlySet<number>): Promise<TmdbMapping> {
  const [stored] = await db
    .select()
    .from(tmdbMapping)
    .where(eq(tmdbMapping.anilistId, entry.id))
    .limit(1);

  if (stored && stored.resolvedAt.getTime() + mappingLifetimeMs(entry, stored) > Date.now()) {
    return stored;
  }

  let pending = inFlight.get(entry.id);
  if (!pending) {
    pending = match(entry, new Set([...resolving, entry.id])).finally(() => {
      inFlight.delete(entry.id);
    });
    inFlight.set(entry.id, pending);
  }

  return pending;
}

async function match(entry: FranchiseEntry, resolving: ReadonlySet<number>): Promise<TmdbMapping> {
  const subject = toMatchSubject(entry);
  // Synonyms are too noisy to search with.
  const queries = primaryTitlesOf(entry);
  const predecessors = await predecessorMappings(entry, resolving);
  const placement = subject.format === "MOVIE"
    ? (await bestMoviePlacement(subject, queries)) ?? (await bestShowPlacement(subject, predecessors, []))
    : (await bestShowPlacement(subject, predecessors, queries)) ??
      (isSingleEpisode(subject) ? await bestMoviePlacement(subject, queries) : null);

  const episodes = placement?.mediaType === "tv" ? placement.episodes : [];
  const values = {
    mediaType: placement?.mediaType ?? null,
    tmdbId: placement?.tmdbId ?? null,
    seasonNumber: episodes[0]?.seasonNumber ?? null,
    episodeNumber: episodes[0]?.episodeNumber ?? null,
    episodes,
    method: placement?.method ?? null,
    score: placement?.score ?? null,
    resolvedAt: new Date()
  };

  const [row] = await db
    .insert(tmdbMapping)
    .values({
      anilistId: entry.id,
      ...values
    })
    .onConflictDoUpdate({
      target: tmdbMapping.anilistId,
      set: values
    })
    .returning();

  if (!row) {
    throw new Error(`Storing the TMDB mapping for anime ${entry.id} returned no row`);
  }

  return row;
}

/** A prequel or parent together with where it mapped. */
interface Predecessor {
  relation: "PREQUEL" | "PARENT";
  mapping: TmdbMapping;
}

/**
 * Resolves the entry's prequels and parents. Entries already being resolved
 * further up the chain are skipped, which breaks relation cycles.
 */
async function predecessorMappings(entry: FranchiseEntry, resolving: ReadonlySet<number>): Promise<Predecessor[]> {
  const edges = (entry.relations?.edges ?? []).flatMap((edge) => {
    const relation = edge?.relationType;
    const id = edge?.node?.type === "ANIME" ? edge.node.id : null;
    return id !== null && (relation === "PREQUEL" || relation === "PARENT") && !resolving.has(id)
      ? [
          {
            relation,
            id
          }
        ]
      : [];
  });

  if (edges.length === 0) {
    return [];
  }

  const entries = await loadEntries(edges.map((edge) => edge.id));
  const predecessors: Predecessor[] = [];
  for (const edge of edges) {
    const predecessor = entries.get(edge.id);
    if (predecessor) {
      predecessors.push({
        relation: edge.relation,
        mapping: await resolve(predecessor, resolving)
      });
    }
  }

  return predecessors;
}

/**
 * Places the subject in the most plausible TMDB show.
 *
 * Candidates are the shows the predecessors map to, plus title-search
 * results for `queries`. Movies pass no queries and only fall back to their
 * predecessors' shows, where TMDB sometimes lists a film as a special.
 */
async function bestShowPlacement(subject: MatchSubject, predecessors: readonly Predecessor[], queries: readonly string[]) {
  const candidates = new Map<number, Omit<ShowCandidate, "show">>();
  for (const { relation, mapping } of predecessors) {
    if (mapping.mediaType === "tv" && mapping.tmdbId !== null) {
      candidates.set(mapping.tmdbId, {
        isFranchiseShow: true,
        prequelEnd: candidates.get(mapping.tmdbId)?.prequelEnd ?? (relation === "PREQUEL" ? regularSeasonEnd(mapping) : null)
      });
    }
  }

  for (const showId of await searchedShowIds(subject, queries)) {
    if (!candidates.has(showId)) {
      candidates.set(showId, {
        isFranchiseShow: false,
        prequelEnd: null
      });
    }
  }

  let best: Placement | null = null;
  for (const [showId, candidate] of candidates) {
    const show = await getShow(showId);
    const placement = show
      ? placeInShow(subject, {
          show,
          ...candidate
        })
      : null;

    if (placement && (!best || placement.score > best.score)) {
      best = placement;
    }
  }

  return best;
}

/** The last TMDB episode of a prequel mapped to regular seasons, which a sequel would follow. */
function regularSeasonEnd(mapping: TmdbMapping): TmdbEpisodeRef | null {
  const last = mappedEpisodes(mapping).at(-1);
  return last && last.seasonNumber > 0 ? last : null;
}

/** Finds TMDB shows by title, most similar to the subject first. */
async function searchedShowIds(subject: MatchSubject, queries: readonly string[]) {
  const results = new Map<number, number>();
  for (const query of queries) {
    for (const show of (await searchShows(query)).slice(0, resultsPerQuery)) {
      results.set(show.id, bestSimilarity(subject.titles, [show.name, show.original_name]));
    }
  }

  return [...results]
    .sort(([, left], [, right]) => right - left)
    .slice(0, searchedShowLimit)
    .map(([id]) => id);
}

/** Searches TMDB movies by the subject's titles and returns the best confident match. */
async function bestMoviePlacement(subject: MatchSubject, queries: readonly string[]) {
  let best: Placement | null = null;
  for (const query of queries) {
    for (const movie of (await searchMovies(query)).slice(0, resultsPerQuery)) {
      const placement = placeAsMovie(subject, movie);
      if (placement && (!best || placement.score > best.score)) {
        best = placement;
      }
    }
  }

  return best;
}



/** One-episode specials and OVAs are sometimes released as TMDB movies. */
function isSingleEpisode(subject: MatchSubject) {
  return subject.episodes === 1 && (subject.format === "SPECIAL" || subject.format === "OVA" || subject.format === "ONA");
}

/**
 * The episode links of a TV mapping, validated because they come from a
 * JSON column. A malformed value reads as no links.
 */
export function mappedEpisodes(mapping: TmdbMapping): EpisodeLink[] {
  const parsed = EpisodeLinksSchema.safeParse(mapping.episodes);
  return parsed.success ? parsed.data : [];
}

function mappingLifetimeMs(entry: FranchiseEntry, stored: TmdbMapping) {
  return stored.tmdbId !== null && entry.status === "FINISHED" ? finishedMappingLifetimeMs : volatileMappingLifetimeMs;
}
