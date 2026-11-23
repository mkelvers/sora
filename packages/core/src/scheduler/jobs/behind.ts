import { attempt, day, hour } from "@sora/shared";
import { eq } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { db } from "../../database/client";
import { tmdbMapping } from "../../database/schema/series";
import { UpstreamUnavailableError } from "../../errors";
import { mappedEpisodes, mappings } from "../../series/mapping";
import { continuesPastLinks } from "../../series/matching";
import { getShow } from "../../tmdb/resources";
import type { TmdbShow } from "../../tmdb/resources";
import { scheduleRefresh } from "../queue";
import { Absence } from "./absence";
import { StoredEpisodes } from "./stored-episodes";

/** Any stored copy of a show: what the last reader of it fetched. */
export const storedShowMs = 365 * day;

/** What asking TMDB about one series came to. */
export interface Outcome {
	fetched: number;
	queued: number;
	updated: number;
}

/** A stored series with an episode TMDB is behind on, and how long ago each lack began. */
export class Behind {
	static readonly schema = z.object({
		anilist_id: z.number(),
		is_unlisted: z.boolean(),
		key: z.string(),
		lacking_for_ms: z.number().nullable(),
		lacks_details: z.boolean(),
		laid_out_for_ms: z.number(),
		series_id: z.string(),
		unlisted_for_ms: z.number().nullable(),
	});

	readonly #row: z.infer<typeof Behind.schema>;

	constructor(row: z.infer<typeof Behind.schema>) {
		this.#row = row;
	}

	/** Lays the series out again, when it has no TMDB show and has gone unmatched or without details too long. */
	async relayout(): Promise<Outcome> {
		const row = this.#row;
		const isUnmatched = row.key.startsWith("anilist:");
		let relayoutAfterMs = day;

		if (isUnmatched && row.lacks_details) {
			relayoutAfterMs = new Absence(row.lacking_for_ms).recheckAfter({
				max: day,
				min: hour,
			});
		}

		if (row.laid_out_for_ms <= relayoutAfterMs) {
			return {
				fetched: 0,
				queued: 0,
				updated: 0,
			};
		}

		if (isUnmatched) {
			await mappings.expire(row.anilist_id);
		}

		await scheduleRefresh(row.anilist_id);

		return {
			fetched: 0,
			queued: 1,
			updated: 0,
		};
	}

	/** Asks TMDB again for the series' show, and queues the series when its layout is stale. */
	async refresh(
		showId: number,
		fetchedAt: ReadonlyMap<string, number>,
		logger: Parameters<Task>[1]["logger"],
	): Promise<Outcome> {
		/** How long a show whose episode TMDB has not listed for years goes unasked. */
		const longestWaitMs = 30 * day;

		const row = this.#row;
		let unlistedMs = Infinity;
		let detailsMs = Infinity;

		if (row.is_unlisted) {
			unlistedMs = new Absence(row.unlisted_for_ms).recheckAfter({
				max: longestWaitMs,
				min: hour,
			});
		}

		if (row.lacks_details) {
			detailsMs = day;
		}

		const maxAgeMs = Math.min(unlistedMs, detailsMs);

		if (Date.now() - (fetchedAt.get(`/tv/${showId}`) ?? 0) < maxAgeMs) {
			return {
				fetched: 0,
				queued: 0,
				updated: 0,
			};
		}

		// The stored copy is read before the fresh one replaces it.
		const stored = await attempt(
			getShow(showId, {
				maxAgeMs: storedShowMs,
			}),
			UpstreamUnavailableError,
		);

		if (stored.error) {
			logger.warn(`TMDB failed for show ${showId}: ${stored.error.message}`);

			return {
				fetched: 0,
				queued: 0,
				updated: 0,
			};
		}

		const fresh = await attempt(
			getShow(showId, {
				maxAgeMs,
			}),
			UpstreamUnavailableError,
		);

		if (fresh.error) {
			logger.warn(`TMDB failed for show ${showId}: ${fresh.error.message}`);

			return {
				fetched: 0,
				queued: 0,
				updated: 0,
			};
		}

		const before = stored.data;
		const show = fresh.data;
		let copied = 0;
		let mapping: typeof tmdbMapping.$inferSelect | undefined;

		if (show) {
			copied = await new StoredEpisodes(row.series_id).copy(show.episodes);

			// A series is matched to TMDB's episodes once a day at most, so one
			// matched before TMDB listed its latest episodes keeps linking only
			// the earlier ones until it is matched anew.
			[mapping] = await db
				.select()
				.from(tmdbMapping)
				.where(eq(tmdbMapping.anilistId, row.anilist_id))
				.limit(1);
		}

		const isMatchStale =
			row.is_unlisted && show && mapping && continuesPastLinks(show, mappedEpisodes(mapping));

		// A show TMDB no longer has needs its series matched anew.
		const stale =
			!show ||
			isMatchStale ||
			(row.is_unlisted && (!before || Behind.#keys(before) !== Behind.#keys(show)));

		if (stale) {
			if (isMatchStale) {
				await mappings.expire(row.anilist_id);
			}

			await scheduleRefresh(row.anilist_id);

			return {
				fetched: 1,
				queued: 1,
				updated: copied,
			};
		}

		return {
			fetched: 1,
			queued: 0,
			updated: copied,
		};
	}

	/** Which episodes TMDB lists for a show, by season and number. */
	static #keys(show: TmdbShow) {
		return show.episodes
			.map((episode) => `${episode.season_number}:${episode.episode_number}`)
			.toSorted()
			.join(",");
	}
}
