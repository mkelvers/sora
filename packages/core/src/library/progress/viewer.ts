import { and, eq, or } from "drizzle-orm";

import { db } from "../../database/client";
import { episodeProgress, seriesState } from "../../database/schema/library";
import type { NextEpisode } from "../../models/library";
import { getAdjacentEpisodes } from "../../series/queries";
import { clearSeriesState } from "../state";
import { updateWatchlistAfterPlayback } from "../watchlist/watchlist";
import type { EpisodeAddress } from "./progress";

/** One user, as their progress and rewatches see them. */
export class Viewer {
	readonly #userId: string;

	constructor(userId: string) {
		this.#userId = userId;
	}

	/** Whether the user is rewatching a series; see `startRewatch`. */
	async rewatching(seriesId: string): Promise<boolean> {
		const userId = this.#userId;

		const [state] = await db
			.select({
				rewatchStartedAt: seriesState.rewatchStartedAt,
			})
			.from(seriesState)
			.where(and(eq(seriesState.userId, userId), eq(seriesState.seriesId, seriesId)))
			.limit(1);

		return !!state?.rewatchStartedAt;
	}

	/** Forgets the user's progress in their rewatch of a series. */
	async forgetRewatch(seriesId: string) {
		const userId = this.#userId;

		await db
			.delete(episodeProgress)
			.where(
				and(
					eq(episodeProgress.userId, userId),
					eq(episodeProgress.seriesId, seriesId),
					eq(episodeProgress.rewatch, true),
				),
			);
	}

	/**
	 * Ends the user's rewatch of a series, forgetting its progress, so the
	 * series is back as their first viewing left it.
	 */
	async endRewatch(seriesId: string) {
		const userId = this.#userId;

		await this.forgetRewatch(seriesId);
		await clearSeriesState(userId, seriesId, {
			rewatch: true,
		});
	}

	/**
	 * Moves the series' watchlist status on after an episode was played or
	 * marked, and ends a rewatch once its last episode is finished.
	 */
	async after(address: EpisodeAddress, finished: boolean) {
		const userId = this.#userId;

		await updateWatchlistAfterPlayback(userId, address.seriesId, {
			episode: address.episode,
			finished,
		});

		if (finished) {
			const adjacent = await getAdjacentEpisodes(address.seriesId, address.episode);

			if (adjacent.next === null) {
				await this.endRewatch(address.seriesId);
			}
		}
	}

	/**
	 * The episode to play next in each series, keyed by series ID, given the
	 * episode the user played last in it: that episode while it is unfinished,
	 * else the one after it, with the progress the user has in that one in the
	 * same viewing. A series with no episode after a finished one is left out.
	 */
	async next(
		played: readonly (EpisodeAddress & {
			finished: boolean;
			rewatch: boolean;
		})[],
	): Promise<Map<string, NextEpisode>> {
		const userId = this.#userId;

		const candidates = await Promise.all(
			played.map(async (last) => {
				if (!last.finished) {
					return {
						episode: last.episode,
						rewatch: last.rewatch,
						seriesId: last.seriesId,
					};
				}

				const adjacent = await getAdjacentEpisodes(last.seriesId, last.episode);

				return {
					episode: adjacent.next,
					rewatch: last.rewatch,
					seriesId: last.seriesId,
				};
			}),
		);

		const found = candidates.flatMap(({ seriesId, rewatch, episode }) => {
			if (episode === null) {
				return [];
			}

			return [
				{
					episode,
					rewatch,
					seriesId,
				},
			];
		});

		if (found.length === 0) {
			return new Map();
		}

		const started = await db
			.select()
			.from(episodeProgress)
			.where(
				and(
					eq(episodeProgress.userId, userId),
					eq(episodeProgress.finished, false),
					or(
						...found.map((next) =>
							and(
								eq(episodeProgress.seriesId, next.seriesId),
								eq(episodeProgress.episode, next.episode),
								eq(episodeProgress.rewatch, next.rewatch),
							),
						),
					),
				),
			);

		return new Map(
			found.map(({ seriesId, rewatch, episode }) => {
				const unfinished = started.find(
					(row) => row.seriesId === seriesId && row.episode === episode && row.rewatch === rewatch,
				);

				return [
					seriesId,
					{
						duration_seconds: unfinished?.durationSeconds ?? null,
						episode,
						position_seconds: unfinished?.positionSeconds ?? 0,
					},
				];
			}),
		);
	}
}
