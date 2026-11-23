import { sequence } from "@sora/shared";
import { and, eq, isNotNull } from "drizzle-orm";

import { db } from "../../database/client";
import { episodeStill, titleEpisode } from "../../database/schema/series";
import { imageUrl } from "../../tmdb/resources";
import type { TmdbEpisode } from "../../tmdb/resources";

/** The stored episodes of one series. */
export class StoredEpisodes {
	readonly #seriesId: string;

	constructor(seriesId: string) {
		this.#seriesId = seriesId;
	}

	/**
	 * Applies available TMDB details and the stored still choices. A partial
	 * response leaves existing details in place. Returns the number of changes.
	 */
	async copy(showId: number, episodes: readonly TmdbEpisode[]): Promise<number> {
		const seriesId = this.#seriesId;
		const placeholderTitle = /^episode [0-9]+$/iu;

		const tmdbEpisodes = new Map(
			episodes.map((episode) => [`${episode.season_number}:${episode.episode_number}`, episode]),
		);

		const stored = await db
			.select({
				airDate: titleEpisode.airDate,
				chosenEpisode: episodeStill.episodeNumber,
				chosenPath: episodeStill.path,
				number: titleEpisode.number,
				overview: titleEpisode.overview,
				runtimeMinutes: titleEpisode.runtimeMinutes,
				stillUrl: titleEpisode.stillUrl,
				title: titleEpisode.title,
				tmdbEpisodeNumber: titleEpisode.tmdbEpisodeNumber,
				tmdbSeasonNumber: titleEpisode.tmdbSeasonNumber,
			})
			.from(titleEpisode)
			.leftJoin(
				episodeStill,
				and(
					eq(episodeStill.showId, showId),
					eq(episodeStill.seasonNumber, titleEpisode.tmdbSeasonNumber),
					eq(episodeStill.episodeNumber, titleEpisode.tmdbEpisodeNumber),
				),
			)
			.where(and(eq(titleEpisode.seriesId, seriesId), isNotNull(titleEpisode.tmdbEpisodeNumber)));

		const updates = stored.flatMap((episode) => {
			const tmdbEpisode = tmdbEpisodes.get(
				`${episode.tmdbSeasonNumber}:${episode.tmdbEpisodeNumber}`,
			);

			if (!tmdbEpisode) {
				return [];
			}

			const { name, still_path: stillPath } = tmdbEpisode;
			let title: string | undefined;
			let stillUrl: string | null | undefined;

			if (name !== null && !placeholderTitle.test(name)) {
				title = name;
			}

			if (episode.chosenEpisode !== null) {
				// A stored null means the still was checked and rejected.
				stillUrl = imageUrl(episode.chosenPath, "original");
			} else if (stillPath !== null) {
				stillUrl = imageUrl(stillPath, "original");
			}

			const details = {
				airDate: tmdbEpisode.air_date ?? undefined,
				overview: tmdbEpisode.overview ?? undefined,
				runtimeMinutes: tmdbEpisode.runtime ?? undefined,
				stillUrl,
				title,
			};

			const unchanged =
				(details.airDate === undefined || episode.airDate === details.airDate) &&
				(details.overview === undefined || episode.overview === details.overview) &&
				(details.runtimeMinutes === undefined ||
					episode.runtimeMinutes === details.runtimeMinutes) &&
				(details.stillUrl === undefined || episode.stillUrl === details.stillUrl) &&
				(details.title === undefined || episode.title === details.title);

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
