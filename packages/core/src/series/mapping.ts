import { day } from "@sora/shared";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { tmdbHint, tmdbMapping } from "../database/schema";
import { InFlight } from "../in-flight";
import {
	getCollectionParts,
	getMovie,
	getShow,
	getShowEpisodeGroups,
	searchMovies,
	searchShows,
} from "../tmdb/resources";
import { loadEntries, primaryTitlesOf, toMatchSubject } from "./entries";
import type { FranchiseEntry } from "./entries";
import { getAniKotoEpisodeCount } from "./episodes";
import { tmdbHintFor } from "./hints";
import type { TmdbHint } from "./hints";
import {
	bestSimilarity,
	placeAfterInCollection,
	placeAsMovie,
	placeInShow,
	placeInEpisodeGroups,
} from "./matching";
import type { EpisodeLink, MatchSubject, Placement, PrequelRun, ShowCandidate } from "./matching";

/** A stored AniList-to-TMDB mapping; `tmdbId` is `null` when no match was found. */
export type TmdbMapping = typeof tmdbMapping.$inferSelect;

const EpisodeLinksSchema = z.array(
	z.object({
		anilistEpisode: z.number().int(),
		episodeNumber: z.number().int(),
		seasonNumber: z.number().int(),
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

const inFlight = new InFlight<number, TmdbMapping>();

const mappingLifetimeMs = (entry: FranchiseEntry, stored: TmdbMapping) =>
	stored.tmdbId !== null && entry.status === "FINISHED"
		? finishedMappingLifetimeMs
		: volatileMappingLifetimeMs;

const freshMapping = async (entry: FranchiseEntry) => {
	const [stored] = await db
		.select()
		.from(tmdbMapping)
		.where(eq(tmdbMapping.anilistId, entry.id))
		.limit(1);

	return stored && stored.resolvedAt.getTime() + mappingLifetimeMs(entry, stored) > Date.now()
		? stored
		: null;
};

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
const predecessorMappings = async (
	entry: FranchiseEntry,
	resolving: ReadonlySet<number>,
	resolve: (entry: FranchiseEntry, resolving: ReadonlySet<number>) => Promise<TmdbMapping>,
): Promise<Predecessor[]> => {
	const edges = (entry.relations?.edges ?? []).flatMap((edge) => {
		const relation = edge?.relationType;
		const id = edge?.node?.type === "ANIME" ? edge.node.id : null;
		return id !== null && (relation === "PREQUEL" || relation === "PARENT") && !resolving.has(id)
			? [
					{
						id,
						relation,
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
				mapping:
					(await freshMapping(predecessor)) ??
					(await resolve(predecessor, new Set([...resolving, predecessor.id]))),
				relation: edge.relation,
			});
		}
	}

	return predecessors;
};

/** Weighs the hinted movies and those found by the subject's titles, and returns the best confident match. */
const bestMoviePlacement = async (
	subject: MatchSubject,
	queries: readonly string[],
	hint: TmdbHint | null,
) => {
	const [hinted, found] = await Promise.all([
		Promise.all((hint?.movieIds ?? []).map((movieId) => getMovie(movieId))),
		Promise.all(
			queries.map(async (query) => {
				const movies = await searchMovies(query);

				return movies.slice(0, resultsPerQuery);
			}),
		),
	]);

	const placements = new Map<number, Placement>();
	const hintedIds = new Set(hint?.movieIds);
	for (const movies of [hinted.filter((movie) => movie !== null), ...found]) {
		for (const movie of movies) {
			const placement = placeAsMovie(subject, movie, hintedIds.has(movie.id));
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
	for (const [movieId] of [...placements].toSorted(
		([, left], [, right]) => right.score - left.score,
	)) {
		const movie = await getMovie(movieId);
		const confirmed = movie && placeAsMovie(subject, movie, hintedIds.has(movie.id));
		if (confirmed) {
			return confirmed;
		}
	}

	return null;
};

/** Places a sequel film after the film its prequel maps to, in that film's TMDB collection. */
const collectionPlacement = async (subject: MatchSubject, predecessors: readonly Predecessor[]) => {
	for (const { relation, mapping } of predecessors) {
		if (relation !== "PREQUEL" || mapping.mediaType !== "movie" || mapping.tmdbId === null) {
			continue;
		}

		const mappedMovie = await getMovie(mapping.tmdbId);
		const collectionId = mappedMovie?.belongs_to_collection?.id;
		const placement =
			collectionId === undefined
				? null
				: placeAfterInCollection(subject, mapping.tmdbId, await getCollectionParts(collectionId));
		if (placement) {
			return placement;
		}
	}

	return null;
};

/**
 * The episode links of a TV mapping, validated because they come from a
 * JSON column. A malformed value reads as no links.
 */
export const mappedEpisodes = (mapping: TmdbMapping): EpisodeLink[] => {
	const parsed = EpisodeLinksSchema.safeParse(mapping.episodes);
	return parsed.success ? parsed.data : [];
};

/**
 * Where a prequel mapped to regular seasons runs, which a sequel would
 * follow. A special listed ahead of its first regular episode is left out.
 */
const regularSeasonRun = (mapping: TmdbMapping): PrequelRun | null => {
	const episodes = mappedEpisodes(mapping);
	const first = episodes.find((episode) => episode.seasonNumber > 0);
	const last = episodes.at(-1);
	return first && last && last.seasonNumber > 0
		? {
				first,
				last,
			}
		: null;
};

/** Finds TMDB shows by title, most similar to the subject first. */
const searchedShowIds = async (subject: MatchSubject, queries: readonly string[]) => {
	const results = new Map<number, number>();
	for (const found of await Promise.all(queries.map((query) => searchShows(query)))) {
		for (const show of found.slice(0, resultsPerQuery)) {
			results.set(show.id, bestSimilarity(subject.titles, [show.name, show.original_name]));
		}
	}

	return [...results]
		.toSorted(([, left], [, right]) => right - left)
		.slice(0, searchedShowLimit)
		.map(([id]) => id);
};

/**
 * Places the subject in the most plausible TMDB show.
 *
 * Candidates are the shows the predecessors map to, the hinted show, and
 * title-search results for `queries`. Movies pass no queries and only fall
 * back to those shows, where TMDB sometimes lists a film as a special.
 */
const bestShowPlacement = async (
	subject: MatchSubject,
	predecessors: readonly Predecessor[],
	hint: TmdbHint | null,
	queries: readonly string[],
) => {
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
	const shows = await Promise.all(
		[...candidates.keys()].map(async (showId) => {
			const [show, episodeGroups] = await Promise.all([
				getShow(showId),
				getShowEpisodeGroups(showId),
			]);
			return { episodeGroups, show };
		}),
	);
	let best: Placement | null = null;
	for (const [index, candidate] of [...candidates.values()].entries()) {
		const loaded = shows[index];
		if (!loaded) {
			continue;
		}
		const { show, episodeGroups } = loaded;
		const placement = show
			? (placeInEpisodeGroups(subject, show, episodeGroups) ??
				placeInShow(subject, {
					show,
					...candidate,
				}))
			: null;

		if (placement && (!best || placement.score > best.score)) {
			best = placement;
		}
	}

	return best;
};

/**
 * Specials and OVAs are sometimes released as TMDB movies, whatever their
 * episode count. The movie's runtime must still match their total length.
 */
const isShortRelease = (subject: MatchSubject) =>
	subject.format === "SPECIAL" || subject.format === "OVA" || subject.format === "ONA";

const match = async (
	entry: FranchiseEntry,
	resolving: ReadonlySet<number>,
): Promise<TmdbMapping> => {
	const subject = {
		...toMatchSubject(entry, new Date()),
		playbackEpisodes: await getAniKotoEpisodeCount(entry.id),
	};
	// Synonyms are too noisy to search with.
	const queries = primaryTitlesOf(entry);
	const predecessors = await predecessorMappings(entry, resolving, match);
	const hint = await tmdbHintFor(entry.id);
	const placement =
		subject.format === "MOVIE"
			? ((await bestMoviePlacement(subject, queries, hint)) ??
				(await collectionPlacement(subject, predecessors)) ??
				(await bestShowPlacement(subject, predecessors, hint, [])))
			: ((await bestShowPlacement(subject, predecessors, hint, queries)) ??
				(isShortRelease(subject) ? await bestMoviePlacement(subject, queries, hint) : null));

	const episodes = placement?.mediaType === "tv" ? placement.episodes : [];
	const values = {
		episodeNumber: episodes[0]?.episodeNumber ?? null,
		episodes,
		mediaType: placement?.mediaType ?? null,
		method: placement?.method ?? null,
		resolvedAt: new Date(),
		score: placement?.score ?? null,
		seasonNumber: episodes[0]?.seasonNumber ?? null,
		tmdbId: placement?.tmdbId ?? null,
	};

	const [row] = await db
		.insert(tmdbMapping)
		.values({
			anilistId: entry.id,
			...values,
		})
		.onConflictDoUpdate({
			set: values,
			target: tmdbMapping.anilistId,
		})
		.returning();

	if (!row) {
		throw new Error(`Storing the TMDB mapping for anime ${entry.id} returned no row`);
	}

	return row;
};

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
export const resolveMapping = async (entry: FranchiseEntry): Promise<TmdbMapping> => {
	const stored = await freshMapping(entry);
	if (stored) {
		return stored;
	}

	return inFlight.run(entry.id, () => match(entry, new Set([entry.id])));
};

/**
 * Marks the stored mappings of `anilistIds` to be matched again, as when
 * their TMDB hints changed. A mapping already at one of its entry's hinted
 * titles is kept, since a hint cannot move it elsewhere.
 *
 * @returns The entries whose mappings were marked.
 */
export const expireMappingsAgainstHints = async (
	anilistIds: readonly number[],
): Promise<number[]> => {
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
};

/**
 * Marks an entry's stored mapping to be matched again on its next layout,
 * as when TMDB may have started to list an entry it did not match.
 */
export const expireMapping = async (anilistId: number) => {
	await db
		.update(tmdbMapping)
		.set({
			resolvedAt: new Date(0),
		})
		.where(eq(tmdbMapping.anilistId, anilistId));
};
