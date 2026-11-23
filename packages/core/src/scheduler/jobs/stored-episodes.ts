import { sequence } from "@sora/shared";
import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "../../database/client";
import { titleEpisode } from "../../database/schema/series";
import { imageUrl } from "../../tmdb/resources";
import type { TmdbEpisode } from "../../tmdb/resources";

/** The stored episodes of one series. */
export class StoredEpisodes {
	readonly #seriesId: string;

	constructor(seriesId: string) {
		this.#seriesId = seriesId;
	}

	/**
	 * Copies TMDB's details of `episodes` onto the series' episodes, as a
	 * layout would derive them (see `layoutEpisodes`). Returns how many
	 * episodes changed.
	 */
	async copy(episodes: readonly TmdbEpisode[]): Promise<number> {
		const seriesId = this.#seriesId;

		const tmdbEpisodes = new Map(
			episodes.map((episode) => [`${episode.season_number}:${episode.episode_number}`, episode]),
		);

		const stored = await db
			.select({
				airDate: titleEpisode.airDate,
				number: titleEpisode.number,
				overview: titleEpisode.overview,
				runtimeMinutes: titleEpisode.runtimeMinutes,
				stillUrl: titleEpisode.stillUrl,
				title: titleEpisode.title,
				tmdbEpisodeNumber: titleEpisode.tmdbEpisodeNumber,
				tmdbSeasonNumber: titleEpisode.tmdbSeasonNumber,
			})
			.from(titleEpisode)
			.where(and(eq(titleEpisode.seriesId, seriesId), isNotNull(titleEpisode.tmdbEpisodeNumber)));

		const updates = stored.flatMap((episode) => {
			const tmdbEpisode = tmdbEpisodes.get(
				`${episode.tmdbSeasonNumber}:${episode.tmdbEpisodeNumber}`,
			);

			if (!tmdbEpisode) {
				return [];
			}

			const details = {
				airDate: tmdbEpisode.air_date,
				overview: tmdbEpisode.overview,
				// Without TMDB's runtime a layout falls back to AniList's, which is not at hand here.
				runtimeMinutes: tmdbEpisode.runtime ?? episode.runtimeMinutes,
				stillUrl: imageUrl(tmdbEpisode.still_path, "original"),
				title: tmdbEpisode.name,
			};

			const unchanged =
				episode.airDate === details.airDate &&
				episode.overview === details.overview &&
				episode.runtimeMinutes === details.runtimeMinutes &&
				episode.stillUrl === details.stillUrl &&
				episode.title === details.title;

			if (unchanged) {
				return [];
			}

			return [
				{
					details,
					number: episode.number,
				},
			];
		});

		await sequence.all(updates, async ({ details, number }) => {
			await db
				.update(titleEpisode)
				.set(details)
				.where(and(eq(titleEpisode.seriesId, seriesId), eq(titleEpisode.number, number)));
		});

		return updates.length;
	}
}
