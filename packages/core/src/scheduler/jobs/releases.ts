import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import {
	anikotoSeries,
	providerEpisodes,
	providerMapping,
	seriesEntry,
} from "../../database/schema";
import { AnimeNotFoundError } from "../../errors";
import {
	getStoredUnits,
	refreshProviderUnits,
	type ProviderUnit,
} from "../../playback/episodes/episodes";
import {
	aniKoto,
	readAniKotoChanges,
	readAniKotoEpisodeList,
} from "../../playback/providers/registry";
import { day, minute } from "../../time";
import { scheduleAniKotoPoll, scheduleStoredSeriesRefresh } from "../queue";

/**
 * Fetches AniKoto's episode list of one stored AniList entry again, and
 * queues its series to be laid out again when AniKoto gained an episode.
 *
 * Seasons list the episodes AniKoto carries, so the list is what makes a
 * new episode show up; laying the series out again brings in what AniList
 * and TMDB know of it.
 *
 * @returns The episodes AniKoto carries, or `null` when AniList no longer
 *   has the entry.
 * @throws when AniKoto fails.
 */
async function refreshAniKotoEpisodes(anilistId: number): Promise<ProviderUnit[] | null> {
	let anime;
	try {
		anime = await getAnime(anilistId);
	} catch (error) {
		if (error instanceof AnimeNotFoundError) {
			return null;
		}

		throw error;
	}

	const latest = (units: readonly ProviderUnit[]) => units.at(-1)?.number ?? 0;
	const [stored] = (await getStoredUnits([anilistId])).filter(
		(entry) => entry.provider === aniKoto.id,
	);
	const units = await refreshProviderUnits(anime, aniKoto, {
		retryUnmatched: true,
	});
	if (latest(units) > latest(stored?.units ?? [])) {
		await scheduleStoredSeriesRefresh(anilistId);
	}

	return units;
}

/** The graphile-worker task that picks up what AniKoto just changed. */
export const watchAniKotoReleasesTask = "watch-anikoto-releases";

/**
 * Fetches again the AniKoto episode lists of stored entries whose AniKoto
 * series changed since their list was last fetched, or, for an entry
 * AniKoto did not carry, since it was last looked for. Runs every minute,
 * so a new episode shows up within minutes of AniKoto carrying it, whether
 * or not AniList has a schedule for it.
 *
 * Reads the series AniKoto changed most recently (see
 * {@link readAniKotoChanges}): one request a minute of the 60 AniKoto
 * allows.
 */
export const watchAniKotoReleases: Task = async (_payload, helpers) => {
	const changes = await readAniKotoChanges();
	const changedAt = new Map(changes.map((change) => [String(change.anikotoId), change.updatedAt]));
	const mapped = changes.length
		? await db
				.select({
					anilistId: providerMapping.anilistId,
					anikotoId: providerMapping.providerMediaId,
				})
				.from(providerMapping)
				.where(
					and(
						eq(providerMapping.provider, aniKoto.id),
						inArray(providerMapping.providerMediaId, [...changedAt.keys()]),
					),
				)
		: [];

	const updatedAt = new Map<number, Date>();
	for (const { anilistId, anikotoId } of mapped) {
		const at = anikotoId === null ? undefined : changedAt.get(anikotoId);
		if (at) {
			updatedAt.set(anilistId, at);
		}
	}
	// AniKoto names the AniList entry of a series it just added, which may not
	// be matched to it yet.
	for (const change of changes) {
		if (change.anilistId !== null && !updatedAt.has(change.anilistId)) {
			updatedAt.set(change.anilistId, change.updatedAt);
		}
	}

	const ids = [...updatedAt.keys()];
	if (ids.length === 0) {
		return;
	}

	const [stored, fetched, resolved] = await Promise.all([
		db
			.select({
				anilistId: seriesEntry.anilistId,
			})
			.from(seriesEntry)
			.where(inArray(seriesEntry.anilistId, ids)),
		db
			.select({
				anilistId: providerEpisodes.anilistId,
				at: providerEpisodes.fetchedAt,
			})
			.from(providerEpisodes)
			.where(
				and(eq(providerEpisodes.provider, aniKoto.id), inArray(providerEpisodes.anilistId, ids)),
			),
		db
			.select({
				anilistId: providerMapping.anilistId,
				at: providerMapping.resolvedAt,
			})
			.from(providerMapping)
			.where(
				and(eq(providerMapping.provider, aniKoto.id), inArray(providerMapping.anilistId, ids)),
			),
	]);
	const checkedAt = new Map([...resolved, ...fetched].map((row) => [row.anilistId, row.at]));

	for (const { anilistId } of stored) {
		const checked = checkedAt.get(anilistId);
		if (checked && checked >= updatedAt.get(anilistId)!) {
			continue;
		}

		try {
			const units = await refreshAniKotoEpisodes(anilistId);
			helpers.logger.info(
				`AniKoto changed anime ${anilistId}; it now carries ${units?.length ?? 0} episodes`,
			);
		} catch (error) {
			helpers.logger.warn(`AniKoto failed for anime ${anilistId}: ${String(error)}`);
		}
	}
};

/**
 * How long after AniKoto last changed a series its missing dubs are watched
 * for. Dubs follow their sub by weeks, and AniKoto changes a series with
 * each new sub.
 */
const dubWatchWindowMs = 60 * day;

/** The graphile-worker task that picks up the dubs AniKoto just added. */
export const watchAniKotoDubsTask = "watch-anikoto-dubs";

/**
 * Fetches again the AniKoto episode lists of stored entries once AniKoto
 * dubs an episode their list has without a dub. Runs every few minutes, so
 * a dub shows up within minutes of AniKoto carrying it.
 *
 * AniKoto adding a dub changes neither the episode's nor the series'
 * timestamp, so {@link watchAniKotoReleases} never sees it. Instead, every
 * series AniKoto changed within {@link dubWatchWindowMs} whose stored list
 * has an episode without a dub has its episode list read from AniKoto's
 * site, which costs none of its API's 60 requests a minute. Only an entry
 * that gained a dub is fetched again through the API.
 */
export const watchAniKotoDubs: Task = async (_payload, helpers) => {
	const watched = await db
		.select({
			anilistId: providerMapping.anilistId,
			anikotoId: providerMapping.providerMediaId,
			episodeOffset: providerMapping.episodeOffset,
		})
		.from(providerMapping)
		.innerJoin(
			providerEpisodes,
			and(
				eq(providerEpisodes.anilistId, providerMapping.anilistId),
				eq(providerEpisodes.provider, providerMapping.provider),
			),
		)
		.innerJoin(
			anikotoSeries,
			eq(sql`${anikotoSeries.anikotoId}::text`, providerMapping.providerMediaId),
		)
		.where(
			and(
				eq(providerMapping.provider, aniKoto.id),
				gte(anikotoSeries.updatedAt, new Date(Date.now() - dubWatchWindowMs)),
				sql`exists (
          select 1
          from jsonb_array_elements(${providerEpisodes.units}) as unit
          where not coalesce(unit -> 'languages' @> '["dub"]', false)
        )`,
			),
		);

	const stored = new Map(
		(await getStoredUnits(watched.map((entry) => entry.anilistId)))
			.filter((entry) => entry.provider === aniKoto.id)
			.map((entry) => [entry.anilistId, entry.units]),
	);
	const bySeries = Map.groupBy(watched, (entry) => entry.anikotoId);

	for (const [anikotoId, entries] of bySeries) {
		if (anikotoId === null) {
			continue;
		}

		let listed;
		try {
			listed = await readAniKotoEpisodeList(anikotoId);
		} catch (error) {
			helpers.logger.warn(`AniKoto failed for series ${anikotoId}: ${String(error)}`);
			continue;
		}

		for (const { anilistId, episodeOffset } of entries) {
			const dubbed = (stored.get(anilistId) ?? []).filter(
				(unit) =>
					!unit.languages?.includes("dub") &&
					listed.get(unit.number + episodeOffset)?.languages.includes("dub"),
			);
			if (dubbed.length === 0) {
				continue;
			}

			try {
				await refreshAniKotoEpisodes(anilistId);
				helpers.logger.info(
					`AniKoto dubbed episodes ${dubbed.map((unit) => unit.number).join(", ")} of anime ${anilistId}`,
				);
			} catch (error) {
				helpers.logger.warn(`AniKoto failed for anime ${anilistId}: ${String(error)}`);
			}
		}
	}
};

/**
 * How long to wait before each look on AniKoto for an aired episode: every
 * minute at first, since subs usually reach AniKoto within minutes of
 * streaming, then every five minutes for the rest of three hours, since
 * streaming can start hours after the broadcast AniList records. The
 * airing tracker keeps checking after that.
 */
const aniKotoPollDelaysMs = [
	...Array.from(
		{
			length: 15,
		},
		() => minute,
	),
	...Array.from(
		{
			length: 33,
		},
		() => 5 * minute,
	),
];

const PollAniKotoPayloadSchema = z.object({
	anilistId: z.number().int().positive(),
	episode: z.number(),
	attempt: z.number().int().nonnegative(),
});

/**
 * Looks on AniKoto for an episode AniList says has aired, and looks again
 * after the next of {@link aniKotoPollDelaysMs} until AniKoto carries it.
 * Queued by the airing tracker when an episode airs.
 *
 * Only AniKoto is asked, so looking every minute costs one AniKoto request
 * and no AniList request. A look AniKoto fails counts as not finding it.
 */
export const pollAniKoto: Task = async (rawPayload, helpers) => {
	const { anilistId, episode, attempt } = PollAniKotoPayloadSchema.parse(rawPayload);

	let units: ProviderUnit[] | null = [];
	try {
		units = await refreshAniKotoEpisodes(anilistId);
	} catch (error) {
		helpers.logger.warn(`AniKoto failed for anime ${anilistId}: ${String(error)}`);
	}

	if (units === null) {
		return;
	}

	if (units.some((unit) => unit.number >= episode)) {
		helpers.logger.info(`AniKoto carries episode ${episode} of anime ${anilistId}`);
		return;
	}

	const delay = aniKotoPollDelaysMs[attempt];
	if (delay !== undefined) {
		await scheduleAniKotoPoll(
			{
				anilistId,
				episode,
				attempt: attempt + 1,
			},
			new Date(Date.now() + delay),
		);
	}
};
