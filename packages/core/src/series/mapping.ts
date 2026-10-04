import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { tmdbHint, tmdbMapping } from "../database/schema";
import { day } from "../time";
import {
	getCollectionParts,
	getMovie,
	getShow,
	searchMovies,
	searchShows,
} from "../tmdb/resources";
import { loadEntries, primaryTitlesOf, toMatchSubject, type FranchiseEntry } from "./entries";
import { tmdbHintFor, type TmdbHint } from "./hints";
import {
	bestSimilarity,
	placeAfterInCollection,
	placeAsMovie,
	placeInShow,
	type EpisodeLink,
	type MatchSubject,
	type Placement,
	type PrequelRun,
	type ShowCandidate,
} from "./matching";

/** A stored AniList-to-TMDB mapping; `tmdbId` is `null` when no match was found. */
export type TmdbMapping = typeof tmdbMapping.$inferSelect;

const EpisodeLinksSchema = z.array(
	z.object({
		anilistEpisode: z.number().int(),
		seasonNumber: z.number().int(),
		episodeNumber: z.number().int(),
	}),
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
 * from those mappings, from the entry's TMDB hint (see `hints.ts`), and from
 * TMDB title searches; {@link placeInShow} and {@link placeAsMovie} decide
 * between them, so a wrong hint is no more trusted than a search result.
 * Concurrent calls for the same entry share one resolution.
 *
 * @throws {@link UpstreamUnavailableError} when AniList or TMDB fail.
 */
export async function resolveMapping(entry: FranchiseEntry): Promise<TmdbMapping> {
	const stored = await freshMapping(entry);
	if (stored) {
		return stored;
	}

	let pending = inFlight.get(entry.id);
	if (!pending) {
		pending = match(entry, new Set([entry.id])).finally(() => {
			inFlight.delete(entry.id);
		});
		inFlight.set(entry.id, pending);
	}

	return pending;
}

async function freshMapping(entry: FranchiseEntry) {
	const [stored] = await db
		.select()
		.from(tmdbMapping)
		.where(eq(tmdbMapping.anilistId, entry.id))
		.limit(1);

	return stored && stored.resolvedAt.getTime() + mappingLifetimeMs(entry, stored) > Date.now()
		? stored
		: null;
}

async function match(entry: FranchiseEntry, resolving: ReadonlySet<number>): Promise<TmdbMapping> {
	const subject = toMatchSubject(entry, new Date());
	// Synonyms are too noisy to search with.
	const queries = primaryTitlesOf(entry);
	const predecessors = await predecessorMappings(entry, resolving);
	const hint = await tmdbHintFor(entry.id);
	const placement =
		subject.format === "MOVIE"
			? ((await bestMoviePlacement(subject, queries, hint)) ??
				(await collectionPlacement(subject, predecessors)) ??
				(await bestShowPlacement(subject, predecessors, hint, [])))
			: ((await bestShowPlacement(subject, predecessors, hint, queries)) ??
				(isSingleEpisode(subject) ? await bestMoviePlacement(subject, queries, hint) : null));

	const episodes = placement?.mediaType === "tv" ? placement.episodes : [];
	const values = {
		mediaType: placement?.mediaType ?? null,
		tmdbId: placement?.tmdbId ?? null,
		seasonNumber: episodes[0]?.seasonNumber ?? null,
		episodeNumber: episodes[0]?.episodeNumber ?? null,
		episodes,
		method: placement?.method ?? null,
		score: placement?.score ?? null,
		resolvedAt: new Date(),
	};

	const [row] = await db
		.insert(tmdbMapping)
		.values({
			anilistId: entry.id,
			...values,
		})
		.onConflictDoUpdate({
			target: tmdbMapping.anilistId,
			set: values,
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
 *
 * Unlike {@link resolveMapping}, this never waits on a resolution already in
 * flight. Two concurrent resolutions whose relations form a cycle (an OVA's
 * parent listing the OVA as its prequel) would otherwise wait on each other
 * forever; `resolving` stops the recursion instead.
 */
async function predecessorMappings(
	entry: FranchiseEntry,
	resolving: ReadonlySet<number>,
): Promise<Predecessor[]> {
	const edges = (entry.relations?.edges ?? []).flatMap((edge) => {
		const relation = edge?.relationType;
		const id = edge?.node?.type === "ANIME" ? edge.node.id : null;
		return id !== null && (relation === "PREQUEL" || relation === "PARENT") && !resolving.has(id)
			? [
					{
						relation,
						id,
					},
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
				mapping:
					(await freshMapping(predecessor)) ??
					(await match(predecessor, new Set([...resolving, predecessor.id]))),
			});
		}
	}

	return predecessors;
}

/**
 * Places the subject in the most plausible TMDB show.
 *
 * Candidates are the shows the predecessors map to, the hinted show, and
 * title-search results for `queries`. Movies pass no queries and only fall
 * back to those shows, where TMDB sometimes lists a film as a special.
 */
async function bestShowPlacement(
	subject: MatchSubject,
	predecessors: readonly Predecessor[],
	hint: TmdbHint | null,
	queries: readonly string[],
) {
	const candidates = new Map<number, Omit<ShowCandidate, "show">>();
	for (const { relation, mapping } of predecessors) {
		if (mapping.mediaType === "tv" && mapping.tmdbId !== null) {
			candidates.set(mapping.tmdbId, {
				isFranchiseShow: true,
				prequel:
					candidates.get(mapping.tmdbId)?.prequel ??
					(relation === "PREQUEL" ? regularSeasonRun(mapping) : null),
			});
		}
	}

	for (const showId of [
		...(hint?.showId ? [hint.showId] : []),
		...(await searchedShowIds(subject, queries)),
	]) {
		if (!candidates.has(showId)) {
			candidates.set(showId, {
				isFranchiseShow: false,
				prequel: null,
			});
		}
	}

	// Fetched at once, weighed in order, so ties go the same way as fetched in turn.
	const shows = await Promise.all([...candidates.keys()].map((showId) => getShow(showId)));
	let best: Placement | null = null;
	for (const [index, candidate] of [...candidates.values()].entries()) {
		const show = shows[index];
		const placement = show
			? placeInShow(subject, {
					show,
					...candidate,
				})
			: null;

		if (placement && (!best || placement.score > best.score)) {
			best = placement;
		}
	}

	return best;
}

/**
 * Where a prequel mapped to regular seasons runs, which a sequel would
 * follow. A special listed ahead of its first regular episode is left out.
 */
function regularSeasonRun(mapping: TmdbMapping): PrequelRun | null {
	const episodes = mappedEpisodes(mapping);
	const first = episodes.find((episode) => episode.seasonNumber > 0);
	const last = episodes.at(-1);
	return first && last && last.seasonNumber > 0
		? {
				first,
				last,
			}
		: null;
}

/** Finds TMDB shows by title, most similar to the subject first. */
async function searchedShowIds(subject: MatchSubject, queries: readonly string[]) {
	const results = new Map<number, number>();
	for (const found of await Promise.all(queries.map((query) => searchShows(query)))) {
		for (const show of found.slice(0, resultsPerQuery)) {
			results.set(show.id, bestSimilarity(subject.titles, [show.name, show.original_name]));
		}
	}

	return [...results]
		.sort(([, left], [, right]) => right - left)
		.slice(0, searchedShowLimit)
		.map(([id]) => id);
}

/** Weighs the hinted movies and those found by the subject's titles, and returns the best confident match. */
async function bestMoviePlacement(
	subject: MatchSubject,
	queries: readonly string[],
	hint: TmdbHint | null,
) {
	const [hinted, found] = await Promise.all([
		Promise.all((hint?.movieIds ?? []).map((movieId) => getMovie(movieId))),
		Promise.all(
			queries.map(async (query) => (await searchMovies(query)).slice(0, resultsPerQuery)),
		),
	]);

	const placements = new Map<number, Placement>();
	for (const movies of [hinted.filter((movie) => movie !== null), ...found]) {
		for (const movie of movies) {
			const placement = placeAsMovie(subject, movie);
			if (
				placement &&
				placement.score > (placements.get(movie.id)?.score ?? Number.NEGATIVE_INFINITY)
			) {
				placements.set(movie.id, placement);
			}
		}
	}

	// Search results leave out runtimes, which tell a bonus short from the
	// film it was released with, so the best are checked against the details.
	for (const [movieId] of [...placements].sort(([, left], [, right]) => right.score - left.score)) {
		const movie = await getMovie(movieId);
		const confirmed = movie && placeAsMovie(subject, movie);
		if (confirmed) {
			return confirmed;
		}
	}

	return null;
}

/** Places a sequel film after the film its prequel maps to, in that film's TMDB collection. */
async function collectionPlacement(subject: MatchSubject, predecessors: readonly Predecessor[]) {
	for (const { relation, mapping } of predecessors) {
		if (relation !== "PREQUEL" || mapping.mediaType !== "movie" || mapping.tmdbId === null) {
			continue;
		}

		const collectionId = (await getMovie(mapping.tmdbId))?.belongs_to_collection?.id;
		const placement =
			collectionId === undefined
				? null
				: placeAfterInCollection(subject, mapping.tmdbId, await getCollectionParts(collectionId));
		if (placement) {
			return placement;
		}
	}

	return null;
}

/** One-episode specials and OVAs are sometimes released as TMDB movies. */
function isSingleEpisode(subject: MatchSubject) {
	return (
		subject.episodes === 1 &&
		(subject.format === "SPECIAL" || subject.format === "OVA" || subject.format === "ONA")
	);
}

/**
 * Marks the stored mappings of `anilistIds` to be matched again, as when
 * their TMDB hints changed. A mapping already at one of its entry's hinted
 * titles is kept, since a hint cannot move it elsewhere.
 *
 * @returns The entries whose mappings were marked.
 */
export async function expireMappingsAgainstHints(anilistIds: readonly number[]): Promise<number[]> {
	if (anilistIds.length === 0) {
		return [];
	}

	const expired = await db
		.update(tmdbMapping)
		.set({
			resolvedAt: new Date(0),
		})
		.where(
			and(
				inArray(tmdbMapping.anilistId, [...anilistIds]),
				sql`not exists (
          select 1 from ${tmdbHint}
          where ${tmdbHint.anilistId} = ${tmdbMapping.anilistId}
            and (
              (${tmdbMapping.mediaType} = 'tv' and ${tmdbHint.showId} = ${tmdbMapping.tmdbId})
              or (${tmdbMapping.mediaType} = 'movie' and ${tmdbMapping.tmdbId} = any(${tmdbHint.movieIds}))
            )
        )`,
			),
		)
		.returning({
			anilistId: tmdbMapping.anilistId,
		});

	return expired.map((row) => row.anilistId);
}

/**
 * Marks an entry's stored mapping to be matched again on its next layout,
 * as when TMDB may have started to list an entry it did not match.
 */
export async function expireMapping(anilistId: number) {
	await db
		.update(tmdbMapping)
		.set({
			resolvedAt: new Date(0),
		})
		.where(eq(tmdbMapping.anilistId, anilistId));
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
	return stored.tmdbId !== null && entry.status === "FINISHED"
		? finishedMappingLifetimeMs
		: volatileMappingLifetimeMs;
}
