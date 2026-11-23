import type { TmdbMovie, TmdbShow } from "../tmdb/resources";
import { tmdbImageUrl } from "../tmdb/resources";
import type { SeriesEpisode } from "./series";

/** An episode laid out from what TMDB lists for it, or from the film it is. */
export class LaidOutEpisode {
	readonly #number: number;
	readonly #tmdb: TmdbShow["episodes"][number] | null;
	readonly #film: Pick<
		TmdbMovie,
		"title" | "overview" | "release_date" | "runtime" | "backdrop_path"
	> | null;
	readonly #durationMinutes: number | null;

	/**
	 * @param film - The film the episode is the only episode of, which gives what TMDB's episode does not.
	 * @param durationMinutes - AniList's length of an episode, when TMDB gives none.
	 */
	constructor(
		number: number,
		tmdb: TmdbShow["episodes"][number] | null,
		film: Pick<
			TmdbMovie,
			"title" | "overview" | "release_date" | "runtime" | "backdrop_path"
		> | null,
		durationMinutes: number | null,
	) {
		this.#number = number;
		this.#tmdb = tmdb;
		this.#film = film;
		this.#durationMinutes = durationMinutes;
	}

	get episode(): SeriesEpisode {
		const tmdb = this.#tmdb;
		const own = this.#own;
		const filmic = this.#filmic;

		return {
			airDate: own.airDate ?? filmic.airDate,
			number: this.#number,
			overview: own.overview ?? filmic.overview,
			runtimeMinutes: own.runtimeMinutes ?? filmic.runtimeMinutes ?? this.#durationMinutes,
			stillUrl: tmdbImageUrl(own.stillPath ?? filmic.stillPath, "original"),
			title: own.title ?? filmic.title,
			tmdb: tmdb && {
				episodeNumber: tmdb.episode_number,
				seasonNumber: tmdb.season_number,
			},
		};
	}

	/** What the episode takes from the TMDB episode it matched. */
	get #own() {
		const tmdb = this.#tmdb;

		return {
			airDate: tmdb?.air_date ?? null,
			overview: tmdb?.overview ?? null,
			runtimeMinutes: tmdb?.runtime ?? null,
			stillPath: tmdb?.still_path ?? null,
			title: tmdb?.name ?? null,
		};
	}

	/** What the only episode of a film takes from the film. */
	get #filmic() {
		const film = this.#film;

		return {
			airDate: film?.release_date ?? null,
			overview: film?.overview ?? null,
			runtimeMinutes: film?.runtime ?? null,
			stillPath: film?.backdrop_path ?? null,
			title: film?.title ?? null,
		};
	}
}
