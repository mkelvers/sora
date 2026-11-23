import type { TmdbEpisode } from "../tmdb/resources";

/** Identifies one TMDB episode of a show. */
export interface TmdbEpisodeRef {
	seasonNumber: number;
	episodeNumber: number;
}

/** A sequence of TMDB episodes, such as a show's regular seasons or a run within them. */
export class EpisodeTrack {
	readonly #episodes: readonly TmdbEpisode[];

	constructor(episodes: readonly TmdbEpisode[]) {
		this.#episodes = episodes;
	}

	/** The regular seasons as one sequence, in broadcast order. */
	get regular(): TmdbEpisode[] {
		return this.#episodes.filter((episode) => episode.season_number > 0);
	}

	/** The specials season. */
	get specials(): TmdbEpisode[] {
		return this.#episodes.filter((episode) => episode.season_number === 0);
	}

	get medianRuntime(): number | null {
		const runtimes = this.#episodes
			.values()
			.map((episode) => episode.runtime)
			.filter((runtime): runtime is number => runtime !== null && runtime > 0)
			.toArray()
			.toSorted((left, right) => left - right);

		return runtimes[Math.floor(runtimes.length / 2)] ?? null;
	}

	/** The index of `ref`, or -1 when it is not on the track. */
	position(ref: TmdbEpisodeRef): number {
		return this.#episodes.findIndex(
			(episode) =>
				episode.season_number === ref.seasonNumber && episode.episode_number === ref.episodeNumber,
		);
	}

	/** The index right after `ref`, or `null` when `ref` is not on the track. */
	after(ref: TmdbEpisodeRef): number | null {
		const index = this.position(ref);

		if (index === -1) {
			return null;
		}

		return index + 1;
	}

	/** One AniList episode per episode of the track, numbered from `first`. */
	links(first = 1): (TmdbEpisodeRef & {
		anilistEpisode: number;
	})[] {
		return this.#episodes.map((episode, offset) => ({
			anilistEpisode: first + offset,
			episodeNumber: episode.episode_number,
			seasonNumber: episode.season_number,
		}));
	}

	/** Whether every episode is one of `show`'s, once; groups can lag behind the main show or repeat episodes. */
	canonicalIn(show: readonly TmdbEpisode[]): boolean {
		const episodes = this.#episodes;
		const identities = new Set(episodes.map((episode) => episode.id));

		return (
			identities.size === episodes.length &&
			episodes.every((episode) =>
				show.some(
					(known) =>
						known.id === episode.id &&
						known.season_number === episode.season_number &&
						known.episode_number === episode.episode_number,
				),
			)
		);
	}
}
