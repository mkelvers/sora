import { getMovie, getShow } from "../tmdb/resources";
import type { TmdbMovie, TmdbShow } from "../tmdb/resources";
import type { TmdbMapping } from "./mapping";
import type { SeriesKey } from "./series";

/** The TMDB show or film an AniList entry is mapped to, when the mapping has one. */
export class MatchedTitle {
	readonly #anilistId: number;
	readonly #mapping: Pick<TmdbMapping, "tmdbId" | "mediaType">;

	constructor(anilistId: number, mapping: Pick<TmdbMapping, "tmdbId" | "mediaType">) {
		this.#anilistId = anilistId;
		this.#mapping = mapping;
	}

	/**
	 * Reads the show or film from TMDB, with the series key it gives the
	 * entry. An entry whose TMDB title cannot be read is keyed as one TMDB
	 * does not list.
	 */
	async load() {
		const { tmdbId, mediaType } = this.#mapping;
		let show: TmdbShow | null = null;
		let movie: TmdbMovie | null = null;

		if (tmdbId !== null) {
			if (mediaType === "tv") {
				show = await getShow(tmdbId);
			}

			if (mediaType === "movie") {
				movie = await getMovie(tmdbId);
			}
		}

		let key: SeriesKey = `anilist:${this.#anilistId}`;

		if (movie) {
			key = `movie:${movie.id}`;
		}

		if (show) {
			key = `tv:${show.id}`;
		}

		return {
			key,
			movie,
			show,
		};
	}
}
