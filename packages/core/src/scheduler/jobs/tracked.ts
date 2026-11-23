import { attempt, inSequence } from "@sora/shared";
import { and, eq, gt, inArray, lte } from "drizzle-orm";
import type { Task } from "graphile-worker";

import type { Anime } from "../../catalog/models/anime";
import { fetchLatestAiring } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import {
	animeScheduleRelease,
	animeScheduleShow,
	providerMapping,
} from "../../database/schema/playback";
import { getStoredUnits, refreshProviderUnits } from "../../playback/episodes/episodes";
import { aniKoto, streamProviders } from "../../playback/providers/registry";
import { extendThroughReleased } from "./airing-plan";
import type { AiringState } from "./airing-plan";

/** An anime the airing tracker follows, as AniList last described it. */
export class Tracked {
	readonly #anime: Anime;

	constructor(anime: Anime) {
		this.#anime = anime;
	}

	/**
	 * Reads what AniKoto has of the anime from its stored mapping and episode
	 * list, without asking AniKoto.
	 *
	 * Seasons list only the episodes AniKoto carries (see `isEpisodeAvailable`),
	 * so its list alone says whether an aired episode is out. Other providers'
	 * lists do not count: MegaPlay's are made up from AniList's episode count,
	 * and list a whole season before it premieres.
	 */
	async aniKoto() {
		const anilistId = this.#anime.id;

		const [[mapping], stored] = await Promise.all([
			db
				.select({
					anikotoId: providerMapping.providerMediaId,
				})
				.from(providerMapping)
				.where(
					and(eq(providerMapping.anilistId, anilistId), eq(providerMapping.provider, aniKoto.id)),
				)
				.limit(1),
			getStoredUnits([anilistId]),
		]);

		return {
			/** Whether AniKoto has the anime in its catalogue, with episodes or not yet. */
			carried: Boolean(mapping?.anikotoId),
			/** The latest episode AniKoto carries, or `null` when it carries none. */
			latest: stored.find((entry) => entry.provider === aniKoto.id)?.units.at(-1)?.number ?? null,
		};
	}

	/**
	 * Re-fetches every provider's episode list and stores it. Every provider is
	 * refreshed, not just AniKoto, because playback falls back through all of
	 * them. A failing provider is logged and skipped, and keeps its stored list.
	 */
	async refresh(logger: Parameters<Task>[1]["logger"]) {
		const anime = this.#anime;

		await inSequence(streamProviders, async (provider) => {
			const { error } = await attempt(
				refreshProviderUnits(anime, provider, {
					retryUnmatched: true,
				}),
			);

			if (error) {
				logger.warn(`Provider ${provider.id} failed for anime ${anime.id}: ${error.message}`);
			}
		});
	}

	/**
	 * What a layout reads of the anime: everything but its score, popularity,
	 * tags, and recommendations, which change daily and which cards read from
	 * the stored anime itself.
	 */
	get layout(): Omit<Anime, "score" | "popularity" | "tags" | "recommendations"> {
		const {
			score: _score,
			popularity: _popularity,
			tags: _tags,
			recommendations: _recommendations,
			...inputs
		} = this.#anime;

		return inputs;
	}

	/**
	 * The latest episode AniList says has aired, or `null` when unknown or none.
	 *
	 * Its airing schedule decides when it records the episode: an entry whose
	 * broadcast AniList moved can have no next episode announced while the one
	 * it moved has not reached providers yet. AnimeSchedule's timetable adds
	 * the episodes that came out with it, such as a double-episode premiere,
	 * which AniList records as the last one only, or half an hour or a week
	 * apart; see {@link extendThroughReleased}.
	 */
	async latestAired(): Promise<AiringState["latestAiredEpisode"]> {
		const anime = this.#anime;

		let fromNext: number | null = null;
		let fromStatus: number | null = null;

		if (anime.nextEpisode && anime.nextEpisode.number > 1) {
			fromNext = anime.nextEpisode.number - 1;
		}

		if (anime.status === "FINISHED") {
			fromStatus = anime.episodes;
		}

		const latestAiring = await fetchLatestAiring(anime.id);
		const scheduled = latestAiring?.episode ?? null;
		const known = [fromNext, fromStatus, scheduled].filter((episode) => episode !== null);

		if (known.length === 0) {
			return null;
		}

		const latest = Math.max(...known);

		const released = await db
			.selectDistinct({
				episode: animeScheduleRelease.episode,
			})
			.from(animeScheduleRelease)
			.innerJoin(animeScheduleShow, eq(animeScheduleShow.route, animeScheduleRelease.route))
			.where(
				and(
					eq(animeScheduleShow.anilistId, anime.id),
					inArray(animeScheduleRelease.airType, ["raw", "sub"]),
					gt(animeScheduleRelease.episode, latest),
					lte(animeScheduleRelease.airsAt, new Date()),
				),
			);

		return extendThroughReleased(
			latest,
			released.map((release) => release.episode),
		);
	}
}
