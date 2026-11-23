import { sequence } from "@sora/shared";

import {
	getCollectionParts,
	getMovie,
	getShow,
	getShowEpisodeGroups,
	searchMovies,
	searchShows,
} from "../tmdb/resources";
import type { TmdbHint } from "./hints";
import type { TmdbMapping } from "./mapping";
import { mappedEpisodes } from "./mapping";
import {
	bestSimilarity,
	placeAfterInCollection,
	placeAsMovie,
	placeInShow,
	placeInEpisodeGroups,
} from "./matching";
import type { MatchSubject, Placement, PrequelRun, ShowCandidate } from "./matching";

/** A prequel or parent together with where it mapped. */
export interface Predecessor {
	relation: "PREQUEL" | "PARENT";
	mapping: TmdbMapping;
}

/** Finds where on TMDB an AniList entry, described as a match subject, lives. */
export class Placer {
	/** Search results considered per query. */
	static readonly #resultsPerQuery = 5;

	readonly #subject: MatchSubject;
	readonly #queries: readonly string[];
	readonly #predecessors: readonly Predecessor[];
	readonly #hint: TmdbHint | null;

	/**
	 * @param queries - The titles to search TMDB with.
	 * @param predecessors - The entry's prequels and parents, with where they mapped.
	 * @param hint - The TMDB titles hinted for the entry.
	 */
	constructor(
		subject: MatchSubject,
		queries: readonly string[],
		predecessors: readonly Predecessor[],
		hint: TmdbHint | null,
	) {
		this.#subject = subject;
		this.#queries = queries;
		this.#predecessors = predecessors;
		this.#hint = hint;
	}

	/**
	 * Where a prequel mapped to regular seasons runs, which a sequel would
	 * follow. A special listed ahead of its first regular episode is left out.
	 */
	static #regularRun(mapping: TmdbMapping): PrequelRun | null {
		const episodes = mappedEpisodes(mapping);
		const first = episodes.find((episode) => episode.seasonNumber > 0);
		const last = episodes.at(-1);

		if (!first || !last) {
			return null;
		}

		if (last.seasonNumber > 0) {
			return {
				first,
				last,
			};
		}

		return null;
	}

	/** Where on TMDB the entry lives, from the best of the candidates its format allows. */
	async best() {
		const subject = this.#subject;

		if (subject.format === "MOVIE") {
			return (await this.#bestMovie()) ?? (await this.#collection()) ?? (await this.#bestShow([]));
		}

		const show = await this.#bestShow(this.#queries);

		if (show) {
			return show;
		}

		// Specials and OVAs are sometimes released as TMDB movies, whatever their
		// episode count. The movie's runtime must still match their total length.
		const isShortRelease =
			subject.format === "SPECIAL" || subject.format === "OVA" || subject.format === "ONA";

		if (isShortRelease) {
			return await this.#bestMovie();
		}

		return null;
	}

	/** Weighs the hinted movies and those found by the subject's titles, and returns the best confident match. */
	async #bestMovie() {
		const subject = this.#subject;
		const hint = this.#hint;

		const [hinted, found] = await Promise.all([
			Promise.all((hint?.movieIds ?? []).map((movieId) => getMovie(movieId))),
			Promise.all(
				this.#queries.map(async (query) => {
					const movies = await searchMovies(query);

					return movies.slice(0, Placer.#resultsPerQuery);
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
		const confirmed = await sequence.first(
			[...placements].toSorted(([, left], [, right]) => right.score - left.score),
			async ([movieId]) => {
				const movie = await getMovie(movieId);

				return movie && placeAsMovie(subject, movie, hintedIds.has(movie.id));
			},
		);

		return confirmed ?? null;
	}

	/** Places a sequel film after the film its prequel maps to, in that film's TMDB collection. */
	async #collection() {
		const placement = await sequence.first(this.#predecessors, async ({ relation, mapping }) => {
			if (relation !== "PREQUEL" || mapping.mediaType !== "movie") {
				return null;
			}

			if (mapping.tmdbId === null) {
				return null;
			}

			const mappedMovie = await getMovie(mapping.tmdbId);
			const collectionId = mappedMovie?.belongs_to_collection?.id;

			if (collectionId === undefined) {
				return null;
			}

			return placeAfterInCollection(
				this.#subject,
				mapping.tmdbId,
				await getCollectionParts(collectionId),
			);
		});

		return placement ?? null;
	}

	/** Finds TMDB shows by title, most similar to the subject first. */
	async #searchedShowIds(queries: readonly string[]) {
		/** How many searched shows are loaded in full per entry, best title matches first. */
		const searchedShowLimit = 4;

		const results = new Map<number, number>();

		for (const found of await Promise.all(queries.map((query) => searchShows(query)))) {
			for (const show of found.slice(0, Placer.#resultsPerQuery)) {
				results.set(show.id, bestSimilarity(this.#subject.titles, [show.name, show.original_name]));
			}
		}

		return [...results]
			.toSorted(([, left], [, right]) => right - left)
			.slice(0, searchedShowLimit)
			.map(([id]) => id);
	}

	/**
	 * Places the subject in the most plausible TMDB show.
	 *
	 * Candidates are the shows the predecessors map to, the hinted show, and
	 * title-search results for `queries`. Movies pass no queries and only fall
	 * back to those shows, where TMDB sometimes lists a film as a special.
	 */
	async #bestShow(queries: readonly string[]) {
		const subject = this.#subject;
		const candidates = new Map<number, Omit<ShowCandidate, "show">>();

		for (const { relation, mapping } of this.#predecessors) {
			if (mapping.mediaType === "tv" && mapping.tmdbId !== null) {
				let run: PrequelRun | null = null;

				if (relation === "PREQUEL") {
					run = Placer.#regularRun(mapping);
				}

				candidates.set(mapping.tmdbId, {
					isFranchiseShow: true,
					prequel: candidates.get(mapping.tmdbId)?.prequel ?? run,
				});
			}
		}

		const hinted: number[] = [];

		if (this.#hint?.showId) {
			hinted.push(this.#hint.showId);
		}

		for (const showId of [...hinted, ...(await this.#searchedShowIds(queries))]) {
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

				return {
					episodeGroups,
					show,
				};
			}),
		);

		let best: Placement | null = null;

		for (const [index, candidate] of [...candidates.values()].entries()) {
			const loaded = shows[index];

			if (!loaded?.show) {
				continue;
			}

			const { show, episodeGroups } = loaded;

			const placement =
				placeInEpisodeGroups(subject, show, episodeGroups) ??
				placeInShow(subject, {
					show,
					...candidate,
				});

			if (placement && placement.score > (best?.score ?? Number.NEGATIVE_INFINITY)) {
				best = placement;
			}
		}

		return best;
	}
}
