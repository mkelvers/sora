import { z } from "zod";

import { tmdb } from "../tmdb/client";
import { parseKey } from "./series";

/** What TMDB knows of a title; see `titleFacts`. */
export interface TmdbFacts {
	certification: string | null;
	descriptors: string[];
	keywords: string[];
	imdbId: string | null;
}

/** A TMDB show or film, by its series key. */
export class TmdbTitle {
	static readonly #externalIds = z
		.object({
			imdb_id: z.string().nullish(),
		})
		.optional();

	static readonly #keyword = z.object({
		name: z.string(),
	});

	/** Descriptors are on some countries' ratings only, such as `["Violence", "Fear"]`. */
	static readonly #descriptors = z.array(z.string()).optional();

	static readonly #show = z.object({
		content_ratings: z
			.object({
				results: z.array(
					z.object({
						descriptors: TmdbTitle.#descriptors,
						iso_3166_1: z.string(),
						rating: z.string(),
					}),
				),
			})
			.optional(),
		external_ids: TmdbTitle.#externalIds,
		keywords: z
			.object({
				results: z.array(TmdbTitle.#keyword),
			})
			.optional(),
	});

	static readonly #movie = z.object({
		external_ids: TmdbTitle.#externalIds,
		keywords: z
			.object({
				keywords: z.array(TmdbTitle.#keyword),
			})
			.optional(),
		release_dates: z
			.object({
				results: z.array(
					z.object({
						iso_3166_1: z.string(),
						release_dates: z.array(
							z.object({
								certification: z.string(),
								descriptors: TmdbTitle.#descriptors,
							}),
						),
					}),
				),
			})
			.optional(),
	});

	/** Asks TMDB once for what the facts take; never stored, since the facts are. */
	static readonly #request = {
		maxAgeMs: 0,
		store: false,
	};

	readonly #kind: "tv" | "movie" | "anilist";
	readonly #id: number;

	/** @throws {ZodError} when `key` is not a series key; see `parseKey`. */
	constructor(key: string) {
		const [kind, id] = parseKey(key);
		this.#kind = kind;
		this.#id = id;
	}

	/** Each name once, trimmed, in the order first given. */
	static #distinct(names: readonly string[]) {
		return [
			...new Set(
				names.flatMap((name) => {
					if (name.trim()) {
						return [name.trim()];
					}

					return [];
				}),
			),
		];
	}

	/**
	 * The title's US certification, every country's rating descriptors, its
	 * keywords, and its IMDb ID from TMDB, in one request, or `null` when
	 * TMDB does not know the title.
	 */
	facts() {
		if (this.#kind === "tv") {
			return this.#showFacts();
		}

		return this.#movieFacts();
	}

	async #showFacts(): Promise<TmdbFacts | null> {
		const show = await tmdb(
			`/tv/${this.#id}`,
			{
				append_to_response: "content_ratings,external_ids,keywords",
			},
			TmdbTitle.#show,
			TmdbTitle.#request,
		);

		if (!show) {
			return null;
		}

		const ratings = show.content_ratings?.results ?? [];

		return {
			certification: ratings.find((rating) => rating.iso_3166_1 === "US")?.rating.trim() || null,
			descriptors: TmdbTitle.#distinct(ratings.flatMap((rating) => rating.descriptors ?? [])),
			imdbId: show.external_ids?.imdb_id || null,
			keywords: TmdbTitle.#distinct(show.keywords?.results.map((keyword) => keyword.name) ?? []),
		};
	}

	async #movieFacts(): Promise<TmdbFacts | null> {
		const movie = await tmdb(
			`/movie/${this.#id}`,
			{
				append_to_response: "release_dates,external_ids,keywords",
			},
			TmdbTitle.#movie,
			TmdbTitle.#request,
		);

		if (!movie) {
			return null;
		}

		const releases = (movie.release_dates?.results ?? []).flatMap((country) =>
			country.release_dates.map((release) => ({
				...release,
				country: country.iso_3166_1,
			})),
		);

		return {
			certification:
				releases
					.find((release) => release.country === "US" && release.certification.trim())
					?.certification.trim() ?? null,
			descriptors: TmdbTitle.#distinct(releases.flatMap((release) => release.descriptors ?? [])),
			imdbId: movie.external_ids?.imdb_id || null,
			keywords: TmdbTitle.#distinct(movie.keywords?.keywords.map((keyword) => keyword.name) ?? []),
		};
	}
}
