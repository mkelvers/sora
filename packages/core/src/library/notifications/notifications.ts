import { and, eq, gt, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";

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
import { effectiveStill } from "../../series/edges";
import type { SeriesCard } from "../../series/models";
import { episodeReleasedAt, listedEpisodesOf, toSeriesCards } from "../../series/queries";
import { day } from "../../time";

/**
 * Something that came out for a series on a profile's watchlist, or that
 * continues one: its first episodes, new episodes, or the English dub of
 * episodes that were out already.
 */
export interface Notification {
	/** Stable for as long as the notification is listed. */
	id: string;
	/**
	 * `premiere` when the series' first episode came out, which for a
	 * sequel is the offer of a new season; `episodes` when a series that was
	 * out already gained episodes; `dub` when episodes that were out already
	 * were dubbed in English.
	 */
	kind: "premiere" | "episodes" | "dub";
	series: SeriesCard;
	/** The first episode that came out, or was dubbed, from 1. */
	firstEpisode: number;
	/** The last such episode; the same as `firstEpisode` when there was one. */
	lastEpisode: number;
	/** The title of `lastEpisode`, or `null` when TMDB has none. */
	episodeTitle: string | null;
	/** A still of `lastEpisode`, or of the first for a premiere; `null` when TMDB has none. */
	stillUrl: string | null;
	/** ISO 8601 timestamp of when it came out. */
	releasedAt: string;
	/** Whether the profile has not marked it read. */
	unread: boolean;
}

/** A profile's latest notifications, and how many of all its notifications are unread. */
export interface Notifications {
	items: Notification[];
	unread: number;
}

/** How long a notification is listed after it came out. */
const notificationLifetimeMs = 30 * day;

/** How many entries {@link offeredSeries} follows relations through at most. */
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
export type NotificationGroup = Omit<Notification, "series"> & {
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
 * A series that is only offered, because it continues one on the watchlist,
 * notifies of its premiere and nothing else; the profile asks for the rest
 * by putting it on the watchlist.
 *
 * A notification's ID is its series and first episode, so it stays the same
 * when the time the episode came out is corrected; a dub's ends in `:dub`.
 *
 * @param offered - The IDs of the series that are only offered.
 * @param dismissed - The IDs of the notifications the profile deleted.
 * @param read - The IDs of the notifications the profile marked read.
 */
export function groupNotifications(
	episodes: readonly ReleasedEpisode[],
	offered: ReadonlySet<string> = new Set(),
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
			if (
				dismissed.has(id) ||
				(!first.dubbed && group.some((episode) => episode.watched)) ||
				(offered.has(first.seriesId) && !isPremiere)
			) {
				return [];
			}

			return [
				{
					id,
					kind: first.dubbed ? "dub" : isPremiere ? "premiere" : "episodes",
					seriesId: first.seriesId,
					firstEpisode: first.number,
					lastEpisode: last.number,
					episodeTitle: last.title,
					stillUrl: isPremiere ? first.stillUrl : last.stillUrl,
					releasedAt: first.releasedAt.toISOString(),
					unread: !read.has(id),
				},
			];
		})
		.toSorted(
			(left, right) =>
				right.releasedAt.localeCompare(left.releasedAt) || right.id.localeCompare(left.id),
		);
}

/**
 * Finds the stored series that continue the ones a profile follows, as
 * AniList relates them by sequel and prequel, with the time from which what
 * comes out of each is news: when its franchise's earliest followed series
 * went on the watchlist.
 *
 * Relations are followed through series that are not followed too, so the
 * second sequel of a followed series is found while the first one is not
 * stored. A followed series is left out, as is one in `excluded`.
 *
 * @param followed - The AniList ID of each followed series and when it went on the watchlist.
 * @param excluded - AniList IDs never to offer, such as those the profile dropped.
 */
async function offeredSeries(
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
		const edges = await db
			.select({
				from: series.anilistId,
				to: seriesRelated.anilistId,
			})
			.from(seriesRelated)
			.innerJoin(series, eq(series.id, seriesRelated.seriesId))
			.where(
				and(
					inArray(seriesRelated.relation, ["SEQUEL", "PREQUEL"]),
					or(inArray(series.anilistId, frontier), inArray(seriesRelated.anilistId, frontier)),
				),
			);

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

	const offeredFrom = new Map<number, Date>();
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
			const earlier = offeredFrom.get(id);
			if (!followed.has(id) && !excluded.has(id) && (!earlier || addedAt < earlier)) {
				offeredFrom.set(id, addedAt);
			}
		}
	}

	return offeredFrom;
}

/**
 * Lists what came out in the last 30 days for a profile's watchlist,
 * newest first: one notification per series per moment (see
 * {@link groupNotifications}).
 *
 * Nothing is recorded as episodes come out: an episode counts from when it
 * aired (see {@link episodeReleasedAt}) and once its series lists it, so one
 * AniKoto does not carry yet waits. A dub counts from when AniKoto was first
 * seen to carry it (see `episodeDub`). The watchlist decides who is told,
 * and the rest follows from it, whatever else Sora keeps about what a
 * profile watched:
 *
 * - A series on the watchlist, whatever its status but `dropped`, notifies
 *   of what came out after it was put there, so saving a series never brings
 *   up what it already had.
 * - A sequel or prequel of such a series that is not on the watchlist
 *   notifies of its premiere, as an offer of the next season.
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
	const states = await db
		.select({
			anilistId: series.anilistId,
			status: seriesState.status,
			addedAt: seriesState.addedAt,
		})
		.from(seriesState)
		.innerJoin(series, eq(series.id, seriesState.seriesId))
		.where(and(eq(seriesState.userId, userId), isNotNull(seriesState.status)));
	const followed = new Map(
		states.flatMap((state) =>
			state.status !== "dropped" && state.addedAt
				? [[state.anilistId, state.addedAt] as const]
				: [],
		),
	);
	if (followed.size === 0) {
		return nothing;
	}

	const offered = await offeredSeries(
		followed,
		new Set(states.filter((state) => state.status === "dropped").map((state) => state.anilistId)),
	);
	const rows = await db
		.select()
		.from(series)
		.where(inArray(series.anilistId, [...followed.keys(), ...offered.keys()]));
	const seriesIds = rows.map((row) => row.id);
	const cutoffs = new Map(
		rows.map((row) => [row.id, followed.get(row.anilistId) ?? offered.get(row.anilistId)!]),
	);
	const offeredIds = new Set(rows.filter((row) => offered.has(row.anilistId)).map((row) => row.id));

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
		offeredIds,
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
						},
					]
				: [];
		}),
		unread: all.filter((group) => group.unread).length,
	};
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
