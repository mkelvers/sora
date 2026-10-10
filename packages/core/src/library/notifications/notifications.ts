import { and, eq, gt, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";

import { catalogSeriesAllowed } from "../../catalog/visibility";
import { db } from "../../database/client";
import {
	episodeDub,
	episodeProgress,
	notificationDismissal,
	notificationRead,
	series,
	seriesEpisode,
	seriesRelated,
	seriesState,
} from "../../database/schema";
import type { Notification } from "../../models/library";
import { effectiveStill } from "../../series/edges";
import { episodeReleasedAt } from "../../series/episodes";
import { listedEpisodesOf, toSeriesCards } from "../../series/queries";
import { day } from "../../time";

/** A profile's latest notifications, and how many of all its notifications are unread. */
export interface Notifications {
	items: Notification[];
	unread: number;
}

/** How long a notification is listed after it came out. */
const notificationLifetimeMs = 30 * day;

/** How many entries {@link followedSeries} follows relations through at most. */
const continuityLimit = 500;

/** One episode that came out, or was dubbed, as {@link groupNotifications} reads it. */
export interface ReleasedEpisode {
	seriesId: string;
	/** The episode's number in the series, from 1. */
	number: number;
	title: string | null;
	stillUrl: string | null;
	/** When the episode came out, or its dub when `dubbed`. */
	releasedAt: Date;
	/** Whether the profile played it. */
	watched: boolean;
	/** Whether it is the episode's English dub that came out, not the episode. */
	dubbed: boolean;
}

/** A notification before its series' card is attached. */
export type NotificationGroup = Omit<Notification, "series" | "message"> & {
	seriesId: string;
};

/**
 * Groups released episodes into notifications, newest first: the episodes
 * of one series that came out at the same moment make one, and so do those
 * dubbed at the same moment.
 *
 * A group is a `premiere` when it starts with the series' first episode,
 * `episodes` otherwise. One the profile played any episode of is acted on
 * and left out, as is one it deleted. A `dub` stays when its episodes are
 * played, since a dub is news of episodes that were out already.
 *
 * A notification's ID is its series and first episode, so it stays the same
 * when the time the episode came out is corrected; a dub's ends in `:dub`.
 *
 * @param dismissed - The IDs of the notifications the profile deleted.
 * @param read - The IDs of the notifications the profile marked read.
 */
export function groupNotifications(
	episodes: readonly ReleasedEpisode[],
	dismissed: ReadonlySet<string> = new Set(),
	read: ReadonlySet<string> = new Set(),
): NotificationGroup[] {
	const moments = new Map<string, ReleasedEpisode[]>();
	for (const episode of episodes) {
		const moment = `${episode.seriesId}:${episode.releasedAt.getTime()}:${episode.dubbed}`;
		moments.set(moment, [...(moments.get(moment) ?? []), episode]);
	}

	return [...moments.values()]
		.flatMap((group): NotificationGroup[] => {
			const sorted = group.toSorted((left, right) => left.number - right.number);
			const first = sorted[0]!;
			const last = sorted.at(-1)!;
			const id = `${first.seriesId}:${first.number}${first.dubbed ? ":dub" : ""}`;
			const isPremiere = !first.dubbed && first.number === 1;
			if (dismissed.has(id) || (!first.dubbed && group.some((episode) => episode.watched))) {
				return [];
			}

			return [
				{
					id,
					kind: first.dubbed ? "dub" : isPremiere ? "premiere" : "episodes",
					seriesId: first.seriesId,
					first_episode: first.number,
					last_episode: last.number,
					episode_title: last.title,
					still_url: isPremiere ? first.stillUrl : last.stillUrl,
					released_at: first.releasedAt.toISOString(),
					unread: !read.has(id),
				},
			];
		})
		.toSorted(
			(left, right) =>
				right.released_at.localeCompare(left.released_at) || right.id.localeCompare(left.id),
		);
}

/**
 * Finds the series a profile follows, including connected seasons, as
 * AniList relates them by sequel and prequel. Each uses the earliest
 * watchlist or recorded playback time in its connected seasons as the
 * cutoff for new releases.
 *
 * Relations are followed through series that are not followed too, so the
 * second sequel of a followed series is found while the first one is not
 * stored. Entries in `excluded` are left out, even when they were watched.
 *
 * @param followed - The AniList ID of each saved or played series and when it was followed.
 * @param excluded - AniList IDs not to notify about, such as those the profile dropped.
 */
async function followedSeries(
	followed: ReadonlyMap<number, Date>,
	excluded: ReadonlySet<number>,
): Promise<Map<number, Date>> {
	const neighbours = new Map<number, Set<number>>();
	const link = (from: number, to: number) => {
		neighbours.set(from, (neighbours.get(from) ?? new Set()).add(to));
	};
	const seen = new Set(followed.keys());
	let frontier = [...seen];
	while (frontier.length > 0 && seen.size <= continuityLimit) {
		const edge = {
			from: series.anilistId,
			to: seriesRelated.anilistId,
		};
		const continues = inArray(seriesRelated.relation, ["SEQUEL", "PREQUEL"]);
		const [outgoing, incoming] = await Promise.all([
			db
				.select(edge)
				.from(series)
				.innerJoin(seriesRelated, eq(seriesRelated.seriesId, series.id))
				.where(and(continues, inArray(series.anilistId, frontier))),
			db
				.select(edge)
				.from(seriesRelated)
				.innerJoin(series, eq(series.id, seriesRelated.seriesId))
				.where(and(continues, inArray(seriesRelated.anilistId, frontier))),
		]);
		const edges = [...outgoing, ...incoming];

		frontier = [];
		for (const edge of edges) {
			link(edge.from, edge.to);
			link(edge.to, edge.from);
			for (const id of [edge.from, edge.to]) {
				if (!seen.has(id)) {
					seen.add(id);
					frontier.push(id);
				}
			}
		}
	}

	const followedFrom = new Map<number, Date>();
	for (const [origin, addedAt] of followed) {
		const reached = new Set([origin]);
		const pending = [origin];
		for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
			for (const next of neighbours.get(id) ?? []) {
				if (!reached.has(next)) {
					reached.add(next);
					pending.push(next);
				}
			}
		}

		for (const id of reached) {
			const earlier = followedFrom.get(id);
			if (!excluded.has(id) && (!earlier || addedAt < earlier)) {
				followedFrom.set(id, addedAt);
			}
		}
	}

	return followedFrom;
}

/**
 * Lists what came out in the last 30 days for a profile's saved or played
 * series and their connected seasons,
 * newest first: one notification per series per moment (see
 * {@link groupNotifications}).
 *
 * Nothing is recorded as episodes come out: an episode counts from when it
 * aired (see {@link episodeReleasedAt}) and once its series lists it, so one
 * AniKoto does not carry yet waits. A dub counts from when AniKoto was first
 * seen to carry it (see `episodeDub`). Saving or playing a series follows
 * its connected seasons without adding them to the watchlist:
 *
 * - A saved or played series notifies of episodes and dubs released after
 *   the earliest watchlist or recorded playback time in its connected seasons.
 * - Sequels and prequels notify of all releases, not only their premieres.
 * - A dropped series neither starts following nor receives notifications,
 *   even if it has playback progress. Other connected seasons can still be followed.
 * - A notification goes once the profile plays one of its episodes or
 *   deletes it, and is `unread` until the profile marks it read.
 *
 * Reads only the database.
 */
export async function getNotifications(
	userId: string,
	options: {
		/** @defaultValue 30 */
		limit?: number;
	} = {},
	now = new Date(),
): Promise<Notifications> {
	const nothing = {
		items: [],
		unread: 0,
	};
	const since = new Date(now.getTime() - notificationLifetimeMs);
	const [states, watched] = await Promise.all([
		db
			.select({
				anilistId: series.anilistId,
				status: seriesState.status,
				addedAt: seriesState.addedAt,
			})
			.from(seriesState)
			.innerJoin(series, eq(series.id, seriesState.seriesId))
			.where(
				and(eq(seriesState.userId, userId), isNotNull(seriesState.status), catalogSeriesAllowed),
			),
		db
			.select({
				anilistId: series.anilistId,
				watchedAt: sql<Date>`min(${episodeProgress.watchedAt})`.mapWith(episodeProgress.watchedAt),
			})
			.from(episodeProgress)
			.innerJoin(series, eq(series.id, episodeProgress.seriesId))
			.where(and(eq(episodeProgress.userId, userId), catalogSeriesAllowed))
			.groupBy(series.anilistId),
	]);
	const excluded = new Set(
		states.filter((state) => state.status === "dropped").map((state) => state.anilistId),
	);
	const followed = new Map(
		states.flatMap((state) =>
			state.status !== "dropped" && state.addedAt
				? [[state.anilistId, state.addedAt] as const]
				: [],
		),
	);
	for (const entry of watched) {
		const savedAt = followed.get(entry.anilistId);
		if (!excluded.has(entry.anilistId) && (!savedAt || entry.watchedAt < savedAt)) {
			followed.set(entry.anilistId, entry.watchedAt);
		}
	}
	if (followed.size === 0) {
		return nothing;
	}

	const following = await followedSeries(followed, excluded);
	const rows = await db
		.select()
		.from(series)
		.where(and(inArray(series.anilistId, [...following.keys()]), catalogSeriesAllowed));
	const seriesIds = rows.map((row) => row.id);
	const cutoffs = new Map(rows.map((row) => [row.id, following.get(row.anilistId)!]));

	const episodeColumns = {
		seriesId: seriesEpisode.seriesId,
		number: seriesEpisode.number,
		title: seriesEpisode.title,
		stillUrl: effectiveStill,
	};
	const [aired, dubs, played, listed, dismissals, reads] = await Promise.all([
		db
			.select({
				...episodeColumns,
				releasedAt: sql<Date>`${episodeReleasedAt}`.mapWith(seriesEpisode.airedAt),
			})
			.from(seriesEpisode)
			.innerJoin(series, eq(series.id, seriesEpisode.seriesId))
			.where(
				and(
					inArray(seriesEpisode.seriesId, seriesIds),
					gt(episodeReleasedAt, since),
					lte(episodeReleasedAt, now),
				),
			),
		db
			.select({
				...episodeColumns,
				releasedAt: sql<Date>`${episodeDub.releasedAt}`.mapWith(seriesEpisode.airedAt),
			})
			.from(seriesEpisode)
			.innerJoin(series, eq(series.id, seriesEpisode.seriesId))
			.innerJoin(
				episodeDub,
				and(
					eq(episodeDub.anilistId, series.anilistId),
					eq(episodeDub.episode, seriesEpisode.number),
				),
			)
			.where(
				and(
					inArray(seriesEpisode.seriesId, seriesIds),
					isNotNull(episodeDub.releasedAt),
					gt(episodeDub.releasedAt, since),
					lte(episodeDub.releasedAt, now),
				),
			),
		db
			.select({
				seriesId: episodeProgress.seriesId,
				episode: episodeProgress.episode,
			})
			.from(episodeProgress)
			.where(and(eq(episodeProgress.userId, userId), inArray(episodeProgress.seriesId, seriesIds))),
		listedEpisodesOf(rows),
		db
			.select({
				notificationId: notificationDismissal.notificationId,
			})
			.from(notificationDismissal)
			.where(eq(notificationDismissal.userId, userId)),
		db
			.select({
				notificationId: notificationRead.notificationId,
			})
			.from(notificationRead)
			.where(eq(notificationRead.userId, userId)),
	]);
	const playedKeys = new Set(played.map((row) => `${row.seriesId}:${row.episode}`));
	const isListed = (seriesId: string, number: number) =>
		listed.get(seriesId)?.some((episode) => episode.number === number) ?? false;

	const episodes = [
		...aired.map((row) => ({
			...row,
			dubbed: false,
		})),
		...dubs.map((row) => ({
			...row,
			dubbed: true,
		})),
	]
		.filter(
			(row) => isListed(row.seriesId, row.number) && row.releasedAt > cutoffs.get(row.seriesId)!,
		)
		.map((row) => ({
			...row,
			watched: playedKeys.has(`${row.seriesId}:${row.number}`),
		}));

	const all = groupNotifications(
		episodes,
		new Set(dismissals.map((row) => row.notificationId)),
		new Set(reads.map((row) => row.notificationId)),
	);
	const groups = all.slice(0, options.limit ?? 30);
	const shownIds = new Set(groups.map((group) => group.seriesId));
	const cards = await toSeriesCards(rows.filter((row) => shownIds.has(row.id)));

	return {
		items: groups.flatMap(({ seriesId, ...group }): Notification[] => {
			const card = cards.get(seriesId);
			return card
				? [
						{
							...group,
							series: card,
							message: notificationMessage(group, card.format === "MOVIE"),
						},
					]
				: [];
		}),
		unread: all.filter((group) => group.unread).length,
	};
}

/** Describes the release and what the profile can watch, without promotional copy. */
function notificationMessage(
	group: Pick<Notification, "kind" | "first_episode" | "last_episode" | "episode_title">,
	movie: boolean,
) {
	const count = group.last_episode - group.first_episode + 1;
	const range = `${group.first_episode} through ${group.last_episode}`;
	const title = group.episode_title ? `, "${group.episode_title}",` : "";

	if (group.kind === "dub") {
		if (movie) {
			return "The English dub is now available. You can choose the dubbed version when you start the film.";
		}
		return count === 1
			? `The English dub of episode ${group.last_episode}${title} is now available. You can switch to English audio in the player for this episode.`
			: `English dubs are now available for episodes ${range}. You can choose English audio in the player for all ${count} episodes.`;
	}

	if (group.kind === "premiere") {
		if (movie) {
			return "The film is now available to watch in Sora. Open its page to see the available audio versions and start watching.";
		}
		return count > 1
			? `The season has started with ${count} episodes available to watch. Episodes ${range} are listed on the season's page.`
			: `The season has started. Episode 1${title} is now available to watch, and you can open the season's page to see its episode list.`;
	}

	return count > 1
		? `${count} new episodes are now available to watch, episodes ${range}. You can find them in the episode list on the season's page.`
		: `Episode ${group.last_episode}${title} is now available to watch. You can find it in the episode list on the season's page.`;
}

/**
 * Marks some of a profile's notifications read. One that is not listed, or
 * already read, changes nothing.
 *
 * Pass the IDs the profile was shown rather than marking everything, so a
 * notification that came out meanwhile stays unread.
 *
 * @param notificationIds - Each a `Notification.id`.
 */
export async function markNotificationsRead(userId: string, notificationIds: readonly string[]) {
	if (notificationIds.length === 0) {
		return;
	}

	const now = new Date();
	await db.transaction(async (tx) => {
		await tx
			.delete(notificationRead)
			.where(
				and(
					eq(notificationRead.userId, userId),
					lt(notificationRead.readAt, new Date(now.getTime() - notificationLifetimeMs)),
				),
			);
		await tx
			.insert(notificationRead)
			.values(
				notificationIds.map((notificationId) => ({
					userId,
					notificationId,
					readAt: now,
				})),
			)
			.onConflictDoNothing();
	});
}

/**
 * Deletes one of a profile's notifications, so it is never listed again.
 * Deleting one that is not listed, or already deleted, changes nothing.
 *
 * @param notificationId - A `Notification.id`.
 */
export async function dismissNotification(userId: string, notificationId: string) {
	const now = new Date();
	await db.transaction(async (tx) => {
		await tx
			.delete(notificationDismissal)
			.where(
				and(
					eq(notificationDismissal.userId, userId),
					lt(notificationDismissal.dismissedAt, new Date(now.getTime() - notificationLifetimeMs)),
				),
			);
		await tx
			.insert(notificationDismissal)
			.values({
				userId,
				notificationId,
				dismissedAt: now,
			})
			.onConflictDoNothing();
	});
}
