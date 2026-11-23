import { defined } from "@sora/shared";

import type { TmdbEpisode, TmdbEpisodeGroup } from "../tmdb/resources";
import { TitleText } from "./title-text";

/** One of a TMDB show's episode group arrangements, such as its arcs or release parts. */
export class Arrangement {
	readonly #groups: readonly TmdbEpisodeGroup[];

	constructor(groups: readonly TmdbEpisodeGroup[]) {
		this.#groups = groups;
	}

	/**
	 * The episodes of the group at `index`, with those of the numbered parts
	 * after it that carry on from it, while fewer than `wanted` are taken.
	 */
	combined(index: number, wanted: number): TmdbEpisode[] {
		const group = defined(this.#groups[index]);
		const episodes = [...group.episodes];
		let part = /^(?<title>.*) part (?<part>\d+)$/u.exec(new TitleText(group.name).normalized);

		for (const next of this.#groups.slice(index + 1)) {
			if (episodes.length >= wanted || !part) {
				break;
			}

			const nextPart = /^(?<title>.*) part (?<part>\d+)$/u.exec(
				new TitleText(next.name).normalized,
			);

			if (!nextPart) {
				break;
			}

			const following = nextPart[1] === part[1] && Number(nextPart[2]) === Number(part[2]) + 1;

			if (!following) {
				break;
			}

			episodes.push(...next.episodes);
			part = nextPart;
		}

		return episodes;
	}
}
