import { attempt } from "@sora/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { providerEpisodes, providerMapping, series } from "../../database/schema";
import { AnimeNotFoundError } from "../../errors";
import {
	getStoredUnits,
	refreshProviderUnits,
	type ProviderUnit,
} from "../../playback/episodes/episodes";
import { readRecentAniKotoChanges } from "../../playback/providers/anikoto-catalog";
import { aniKoto, providerHttp } from "../../playback/providers/registry";
import { hour, minute } from "../../time";
import { scheduleAniKotoPoll, scheduleStoredSeriesRefresh } from "../queue";

/**
 * Fetches AniKoto's episode list of one stored AniList entry again, and
 * queues its series to be laid out again when AniKoto gained an episode.
 *
 * A series lists the episodes AniKoto carries, so the list is what makes a
 * new episode show up; laying the series out again brings in what AniList
 * and TMDB know of it.
 *
 * @returns The episodes AniKoto carries, or `null` when AniList no longer
 *   has the entry.
 * @throws when AniKoto fails.
 */
async function refreshAniKotoEpisodes(anilistId: number): Promise<ProviderUnit[] | null> {
	const { data, error } = await attempt(getAnime(anilistId), AnimeNotFoundError);
	if (error) {
		return null;
	}

	const latest = (units: readonly ProviderUnit[]) => units.at(-1)?.number ?? 0;
	const storedUnits = await getStoredUnits([anilistId]);
	const [stored] = storedUnits.filter((entry) => entry.provider === aniKoto.id);
	const units = await refreshProviderUnits(data, aniKoto, {
		retryUnmatched: true,
	});
	if (latest(units) > latest(stored?.units ?? [])) {
		await scheduleStoredSeriesRefresh(anilistId);
	}

	return units;
}

/**
 * How far back {@link pickUpAniKotoChanges} reads AniKoto's changes: past
 * the previous half-hourly look, with room for AniKoto's timestamps
 * trailing its episodes.
 */
const changeWindowMs = 2 * hour;

/** The look on AniKoto in flight or made last, which looks made meanwhile share. */
let lastLook: {
	startedAt: number;
	done: Promise<void>;
} | null = null;

/**
 * Fetches again the AniKoto episode lists of stored entries whose AniKoto
 * series changed since their list was last fetched, or, for an entry
 * AniKoto did not carry, since it was last looked for.
 *
 * AniKoto's changes (see {@link readRecentAniKotoChanges}) cost one
 * request, or a few after a burst, however many series changed. A new
 * episode changes its series, and so does a new dub, though not its
 * episode: Daemons of the Shadow Realm, finished a week earlier, changed 20
 * minutes after its episode 23 dub was out.
 *
 * Looks within a minute of one another, such as those for several episodes
 * that aired together, share one.
 */
async function pickUpAniKotoChanges(logger: Parameters<Task>[1]["logger"]) {
	if (lastLook && Date.now() - lastLook.startedAt < minute) {
		return lastLook.done;
	}

	const done = readAndRefresh(logger);
	lastLook = {
		startedAt: Date.now(),
		done,
	};
	return done;
}

async function readAndRefresh(logger: Parameters<Task>[1]["logger"]) {
	const changes = await readRecentAniKotoChanges(
		providerHttp,
		new Date(Date.now() - changeWindowMs),
	);
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
				anilistId: series.anilistId,
			})
			.from(series)
			.where(inArray(series.anilistId, ids)),
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
		const changed = updatedAt.get(anilistId);
		if (checked && changed && checked >= changed) {
			continue;
		}

		const { data, error } = await attempt(refreshAniKotoEpisodes(anilistId));
		if (error) {
			logger.warn(`AniKoto failed for anime ${anilistId}: ${error.message}`);
			continue;
		}
		logger.info(`AniKoto changed anime ${anilistId}; it now carries ${data?.length ?? 0} episodes`);
	}
}

/** The graphile-worker task that picks up what AniKoto changed. */
export const watchAniKotoReleasesTask = "watch-anikoto-releases";

/**
 * Picks up what AniKoto changed (see {@link pickUpAniKotoChanges}) every
 * half hour. Episodes AniList schedules are looked for as they air (see
 * {@link pollAniKoto}), so this catches the rest: dubs, which AniList does
 * not schedule, and episodes of entries it has no schedule for.
 */
export const watchAniKotoReleases: Task = async (_payload, helpers) => {
	await pickUpAniKotoChanges(helpers.logger);
};

/**
 * How long to wait before each further look on AniKoto for an aired
 * episode; the first is five minutes after it airs. Subs of a season
 * reached AniKoto 3 to 70 minutes after AniList's broadcast time, mostly
 * about an hour, and long-running shows' hours later, so looks are close
 * for the first hour and a half, then spread out over the rest of a day.
 * The airing tracker and the half-hourly look catch any later.
 */
const aniKotoPollDelaysMs = [10, 15, 15, 15, 10, 10, 10, 30, 30, 30, 60, 120, 360, 720].map(
	(minutes) => minutes * minute,
);

const PollAniKotoPayloadSchema = z.object({
	anilistId: z.number().int().positive(),
	episode: z.number(),
	language: z.enum(["sub", "dub"]).default("sub"),
	attempt: z.number().int().nonnegative(),
});

/**
 * Looks on AniKoto for an episode AniList says has aired, or for its dub
 * once AnimeSchedule says it is out, and looks again after the next of
 * {@link aniKotoPollDelaysMs} until AniKoto carries it. Queued by the
 * airing tracker when an episode airs, and by `syncDubSchedule` for
 * a dub.
 *
 * A look reads what AniKoto changed (see {@link pickUpAniKotoChanges}),
 * shared with every other look at the time, and costs no AniList request.
 * An entry AniKoto does not carry yet is searched for on AniKoto instead,
 * since a series AniKoto just added may not be matched to it. A look
 * AniKoto fails counts as not finding the episode.
 */
export const pollAniKoto: Task = async (rawPayload, helpers) => {
	const payload = PollAniKotoPayloadSchema.parse(rawPayload);
	const { anilistId, episode, language } = payload;

	const [mapping] = await db
		.select({
			anikotoId: providerMapping.providerMediaId,
		})
		.from(providerMapping)
		.where(and(eq(providerMapping.anilistId, anilistId), eq(providerMapping.provider, aniKoto.id)))
		.limit(1);

	if (mapping?.anikotoId) {
		const { error } = await attempt(pickUpAniKotoChanges(helpers.logger));
		if (error) {
			helpers.logger.warn(`AniKoto failed for anime ${anilistId}: ${error.message}`);
		}
	} else {
		const { data, error } = await attempt(refreshAniKotoEpisodes(anilistId));
		if (error) {
			helpers.logger.warn(`AniKoto failed for anime ${anilistId}: ${error.message}`);
		} else if (data === null) {
			return;
		}
	}

	const storedUnits = await getStoredUnits([anilistId]);
	const [stored] = storedUnits.filter((entry) => entry.provider === aniKoto.id);
	if (
		stored?.units.some(
			(unit) => unit.number >= episode && (language === "sub" || unit.languages?.includes("dub")),
		)
	) {
		helpers.logger.info(`AniKoto carries episode ${episode} (${language}) of anime ${anilistId}`);
		return;
	}

	const delay = aniKotoPollDelaysMs[payload.attempt];
	if (delay !== undefined) {
		await scheduleAniKotoPoll(
			{
				anilistId,
				episode,
				language,
				attempt: payload.attempt + 1,
			},
			new Date(Date.now() + delay),
		);
	}
};
