import { defined } from "@sora/shared";

import type { ScheduledEpisode } from "../models/series";

/** One title's episodes coming out at one time, subbed, dubbed, or both. */
export class TitleSlot {
	readonly #versions: ScheduledEpisode[];

	constructor(versions: ScheduledEpisode[]) {
		this.#versions = versions;
	}

	/**
	 * The episodes as calendar entries: one for the subbed and one for the
	 * dubbed episodes, or a single one when they are the same.
	 */
	get releases() {
		const versions = this.#versions;
		const audioByEpisodes = new Map<string, ("sub" | "dub")[]>();

		for (const airType of ["sub", "dub"] as const) {
			const numbers = versions
				.values()
				.filter((version) => version.air_type === airType)
				.map((version) => version.episode)
				.toArray()
				.toSorted((left, right) => left - right);

			if (!numbers.length) {
				continue;
			}

			const runs: [number, number][] = [];

			for (const number of numbers) {
				const run = runs.at(-1);

				if (run?.[1] === number - 1) {
					run[1] = number;
				} else {
					runs.push([number, number]);
				}
			}

			let noun = "Episodes";

			if (numbers.length === 1) {
				noun = "Episode";
			}

			const episodes = `${noun} ${runs
				.map(([first, last]) => {
					if (first === last) {
						return first;
					}

					return `${first}–${last}`;
				})
				.join(", ")}`;

			audioByEpisodes.set(episodes, [...(audioByEpisodes.get(episodes) ?? []), airType]);
		}

		return [...audioByEpisodes].map(([episodes, audio]) => ({
			audio,
			episodes,
			series: defined(versions[0]).series,
		}));
	}
}
