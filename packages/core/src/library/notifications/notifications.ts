import { and, eq, gt, inArray, isNotNull, lt, lte, notExists, sql } from "drizzle-orm";

import { db } from "../../database/client";
import {
	droppedSeries,
	episodeDub,
	notificationDismissal,
	notificationRead,
	profileShow,
	series,
	seriesEpisode,
	seriesSeason,
	watchedEpisode,
} from "../../database/schema";
import { effectiveStill } from "../../series/edges";
import type { SeriesCard } from "../../series/models";
import {
	episodeReleasedAt,
	getPlayableSeasons,
	toSeriesCards,
	type PlayableSeason,
} from "../../series/queries";
import type { SeasonKind } from "../../series/seasons";
import { day } from "../../time";

/**
 * Something that came out for a series in a user's Shows: a new season,
 * film, or OVA, new episodes of a season that was out already, or the
 * English dub of episodes that were.
 */
export interface Notification {
	/** Stable for as long as the notification is listed. */
	id: string;
	/**
	 * `season` when the season came out, with its first episodes or as a
	 * film; `episodes` when a season that was out already gained episodes;
	 * `dub` when episodes that were out already were dubbed in English.
	 */
	kind: "season" | "episodes" | "dub";
	series: SeriesCard;
	season: {
		id: string;
		kind: SeasonKind;
		/** Position among the series' seasons of the same kind, from 1. */
		number: number;
		/** Such as "Season 2" or the film's title. */
		title: string;
	};
	/** The first episode that came out, or was dubbed, from 1 within the season. */
	firstEpisode: number;
	/** The last such episode; the same as `firstEpisode` when there was one. */
	lastEpisode: number;
	/** The title of `lastEpisode`, or `null` when TMDB has none. */
	episodeTitle: string | null;
	/**
	 * A still of the season's first episode for a new season, and of
	 * `lastEpisode` otherwise, or `null` when TMDB has none.
	 */
	stillUrl: string | null;
	/** ISO 8601 timestamp of when it came out. */
	releasedAt: string;
	/** Whether the user has not marked it read. */
	unread: boolean;
}

/** A user's latest notifications, and how many of all their notifications are unread. */
export interface Notifications {
	items: Notification[];
	unread: number;
}

/** How long a notification is listed after it came out. */
const notificationLifetimeMs = 30 * day;

/**
 * One episode that came out, or was dubbed, for a series in a user's Shows,
 * as {@link groupNotifications} reads it.
 */
export interface ReleasedEpisode {
	seriesId: string;
	seasonId: string;
	/** Position within the season, from 1. */
	number: number;
	title: string | null;
	stillUrl: string | null;
	/** When the episode came out, or its dub when `dubbed`. */
	releasedAt: Date;
	/** Whether the user watched it. */
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
 * of one season that came out at the same moment make one, and so do those
 * dubbed at the same moment.
 *
 * Only episodes that can be played count, so one that aired but that
 * AniKoto does not carry yet makes no notification until it does. A group
 * is a new `season` when it starts with the season's first playable
 * episode, and new `episodes` otherwise. One the user watched any episode
 * of is acted on and left out, as is one the user deleted. A `dub` stays
 * when its episodes are watched, since a dub is news of episodes that were
 * out already.
 *
 * A notification's ID is its season and first episode, so it stays the same
 * when the time the episode came out is corrected; a dub's ends in `:dub`.
 *
 * @param seasons - The seasons the episodes belong to, by season ID. An
 *   episode of a season missing here is left out.
 * @param dismissed - The IDs of the notifications the user deleted.
 * @param read - The IDs of the notifications the user marked read.
 */
export function groupNotifications(
	episodes: readonly ReleasedEpisode[],
	seasons: ReadonlyMap<string, PlayableSeason>,
	dismissed: ReadonlySet<string> = new Set(),
	read: ReadonlySet<string> = new Set(),
): NotificationGroup[] {
	const moments = new Map<string, ReleasedEpisode[]>();
	for (const episode of episodes) {
		if (seasons.get(episode.seasonId)?.episodes.includes(episode.number)) {
			const moment = `${episode.seasonId}:${episode.releasedAt.getTime()}:${episode.dubbed}`;
			moments.set(moment, [...(moments.get(moment) ?? []), episode]);
		}
	}

	return [...moments.values()]
		.flatMap((group): NotificationGroup[] => {
			const sorted = group.toSorted((left, right) => left.number - right.number);
			const first = sorted[0]!;
			const last = sorted.at(-1)!;
			const season = seasons.get(first.seasonId)!;
			const id = `${season.id}:${first.number}${first.dubbed ? ":dub" : ""}`;
			if (dismissed.has(id) || (!first.dubbed && group.some((episode) => episode.watched))) {
				return [];
			}

			const isNewSeason = !first.dubbed && season.episodes[0] === first.number;
			return [
				{
					id,
					kind: first.dubbed ? "dub" : isNewSeason ? "season" : "episodes",
					seriesId: first.seriesId,
					season: {
						id: season.id,
						kind: season.kind,
						number: season.number,
						title: season.title,
					},
					firstEpisode: first.number,
					lastEpisode: last.number,
					episodeTitle: last.title,
					stillUrl: isNewSeason ? first.stillUrl : last.stillUrl,
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
 * Lists what came out in the last 30 days for the series in a user's Shows,
 * newest first: one notification per season per moment (see
 * {@link groupNotifications}).
 *
 * Nothing is recorded as episodes come out: an episode counts from when it
 * aired (see {@link episodeReleasedAt}), the same time that decides whether
 * a season is offered or played next. A dub counts from when AniKoto was
 * first seen to carry it (see `episodeDub`), since nothing schedules every
 * dub. Only what came out after the series entered Shows is listed, so
 * saving a series never brings up what it already had. A series taken out of Shows drops out, as does a dropped
 * one, and a notification goes once the user watches one of its episodes
 * or deletes it. Each is `unread` until the user marks it read.
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
	const since = new Date(now.getTime() - notificationLifetimeMs);
	const released = (dubbed: boolean) => {
		const releasedAt = dubbed ? sql<Date>`${episodeDub.releasedAt}` : episodeReleasedAt;
		const episodes = db
			.select({
				seriesId: seriesSeason.seriesId,
				seasonId: seriesSeason.id,
				number: seriesEpisode.number,
				title: seriesEpisode.title,
				stillUrl: effectiveStill,
				releasedAt: sql<Date>`${releasedAt}`.mapWith(seriesEpisode.airedAt),
				watched: sql<boolean>`${watchedEpisode.userId} is not null`,
			})
			.from(profileShow)
			.innerJoin(series, eq(series.id, profileShow.seriesId))
			.innerJoin(seriesSeason, eq(seriesSeason.seriesId, series.id))
			.innerJoin(seriesEpisode, eq(seriesEpisode.seasonId, seriesSeason.id));

		return (
			dubbed
				? episodes.innerJoin(
						episodeDub,
						and(
							eq(episodeDub.anilistId, seriesEpisode.anilistId),
							eq(episodeDub.episode, seriesEpisode.anilistEpisode),
						),
					)
				: episodes
		)
			.leftJoin(
				watchedEpisode,
				and(
					eq(watchedEpisode.userId, profileShow.userId),
					eq(watchedEpisode.seasonId, seriesEpisode.seasonId),
					eq(watchedEpisode.episode, seriesEpisode.number),
				),
			)
			.where(
				and(
					eq(profileShow.userId, userId),
					notExists(
						db
							.select({
								one: sql`1`,
							})
							.from(droppedSeries)
							.where(
								and(
									eq(droppedSeries.userId, profileShow.userId),
									eq(droppedSeries.seriesId, profileShow.seriesId),
								),
							),
					),
					isNotNull(seriesEpisode.anilistId),
					gt(releasedAt, since),
					gt(releasedAt, profileShow.addedAt),
					lte(releasedAt, now),
				),
			);
	};
	const [aired, dubs, dismissals, reads] = await Promise.all([
		released(false),
		released(true),
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
	const episodes = [
		...aired.map((row) => ({
			...row,
			dubbed: false,
		})),
		...dubs.map((row) => ({
			...row,
			dubbed: true,
		})),
	];
	if (episodes.length === 0) {
		return {
			items: [],
			unread: 0,
		};
	}

	const seasons = await getPlayableSeasons([...new Set(episodes.map((row) => row.seriesId))]);
	const all = groupNotifications(
		episodes,
		new Map([...seasons.values()].flatMap((listed) => listed.map((season) => [season.id, season]))),
		new Set(dismissals.map((row) => row.notificationId)),
		new Set(reads.map((row) => row.notificationId)),
	);
	const groups = all.slice(0, options.limit ?? 30);

	const seriesIds = [...new Set(groups.map((group) => group.seriesId))];
	const cards = seriesIds.length
		? await toSeriesCards(await db.select().from(series).where(inArray(series.id, seriesIds)))
		: new Map<string, SeriesCard>();

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
 * Marks some of a user's notifications read. One that is not listed, or
 * already read, changes nothing.
 *
 * Pass the IDs the user was shown rather than marking everything, so a
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
 * Deletes one of a user's notifications, so it is never listed again.
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
