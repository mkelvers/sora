import { and, eq, gt, inArray, min, sql } from "drizzle-orm";

import { db } from "../../database/client";
import {
	episodeRelease,
	libraryEntry,
	notificationDismissal,
	notificationRead,
	notificationSeen,
	playbackProgress,
	series,
	seriesEpisode,
	seriesSeason,
} from "../../database/schema";
import { effectiveStill } from "../../series/edges";
import type { SeriesCard } from "../../series/models";
import { toSeriesCards } from "../../series/queries";
import type { SeasonKind } from "../../series/seasons";
import { day } from "../../time";

/**
 * Something that came out for a series in a user's library, whatever its
 * status: a new season, film, or OVA, or new episodes of one they have.
 */
export interface Notification {
	/** Stable for as long as the notification is listed. */
	id: string;
	/**
	 * `season` when the season came out, with its first episodes or as a
	 * film; `episodes` when a season that was out already gained episodes.
	 */
	kind: "season" | "episodes";
	series: SeriesCard;
	season: {
		id: string;
		kind: SeasonKind;
		/** Position among the series' seasons of the same kind, from 1. */
		number: number;
		/** Such as "Season 2" or the film's title. */
		title: string;
	};
	/** The first episode that came out, from 1 within the season. */
	firstEpisode: number;
	/** The last episode that came out; the same as `firstEpisode` when one did. */
	lastEpisode: number;
	/** The title of `lastEpisode`, or `null` when TMDB has none. */
	episodeTitle: string | null;
	/**
	 * A still of the season's first episode for a new season, and of
	 * `lastEpisode` otherwise, or `null` when TMDB has none.
	 */
	stillUrl: string | null;
	/** ISO 8601 timestamp of when it came out on Sora. */
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
export const notificationLifetimeMs = 30 * day;

/** One released episode of a series in a user's library, as {@link groupNotifications} reads it. */
export interface ReleasedEpisode {
	seriesId: string;
	seasonId: string;
	seasonKind: SeasonKind;
	seasonNumber: number;
	seasonTitle: string;
	/** Position within the season, from 1. */
	number: number;
	title: string | null;
	stillUrl: string | null;
	releasedAt: Date;
	/** Whether the user watched it. */
	watched: boolean;
}

/** A notification before its series' card is attached. */
export type NotificationGroup = Omit<Notification, "series"> & {
	seriesId: string;
};

/**
 * Groups released episodes into notifications, newest first: the episodes
 * of one season that came out at the same moment make one.
 *
 * A group is a new `season` when nothing of the season came out before it,
 * and new `episodes` otherwise. One the user watched any episode of is
 * acted on and left out, as is one the user deleted.
 *
 * @param firstReleases - When each season first had an episode recorded,
 *   whether that was news or already out when its series was first watched.
 * @param seenAt - Up to when the user marked all their notifications read, or `null` if never.
 * @param dismissed - The IDs of the notifications the user deleted.
 * @param read - The IDs of the notifications the user marked read one by one.
 */
export function groupNotifications(
	episodes: readonly ReleasedEpisode[],
	firstReleases: ReadonlyMap<string, Date>,
	seenAt: Date | null,
	dismissed: ReadonlySet<string> = new Set(),
	read: ReadonlySet<string> = new Set(),
): NotificationGroup[] {
	const groups = new Map<string, ReleasedEpisode[]>();
	for (const episode of episodes) {
		const id = `${episode.seasonId}:${episode.releasedAt.getTime()}`;
		groups.set(id, [...(groups.get(id) ?? []), episode]);
	}

	return [...groups]
		.filter(([id, group]) => !dismissed.has(id) && !group.some((episode) => episode.watched))
		.map(([id, group]): NotificationGroup => {
			const sorted = group.toSorted((left, right) => left.number - right.number);
			const first = sorted[0]!;
			const last = sorted.at(-1)!;
			const firstRelease = firstReleases.get(first.seasonId);
			const isNewSeason = !firstRelease || firstRelease >= first.releasedAt;
			return {
				id,
				kind: isNewSeason ? "season" : "episodes",
				seriesId: first.seriesId,
				season: {
					id: first.seasonId,
					kind: first.seasonKind,
					number: first.seasonNumber,
					title: first.seasonTitle,
				},
				firstEpisode: first.number,
				lastEpisode: last.number,
				episodeTitle: last.title,
				stillUrl: isNewSeason ? first.stillUrl : last.stillUrl,
				releasedAt: first.releasedAt.toISOString(),
				unread: !read.has(id) && (seenAt === null || first.releasedAt > seenAt),
			};
		})
		.toSorted(
			(left, right) =>
				right.releasedAt.localeCompare(left.releasedAt) || right.id.localeCompare(left.id),
		);
}

/**
 * Lists what came out for the series in a user's library in the last
 * {@link notificationLifetimeMs}, newest first: one notification per season
 * per moment, released after the series was added (see `recordReleases`
 * and {@link groupNotifications}). Series taken out of the library drop
 * out, as do notifications the user acted on by watching an episode, and
 * those they deleted. Each is `unread` until the user marks it read.
 */
export async function getNotifications(
	userId: string,
	options: {
		limit?: number;
	} = {},
	now = new Date(),
): Promise<Notifications> {
	const since = new Date(now.getTime() - notificationLifetimeMs);
	const [episodes, [seen], dismissals, reads] = await Promise.all([
		db
			.select({
				seriesId: seriesSeason.seriesId,
				seasonId: seriesSeason.id,
				seasonKind: seriesSeason.kind,
				seasonNumber: seriesSeason.number,
				seasonTitle: seriesSeason.title,
				number: seriesEpisode.number,
				title: seriesEpisode.title,
				stillUrl: effectiveStill,
				releasedAt: episodeRelease.releasedAt,
				watched: sql<boolean>`coalesce(${playbackProgress.watched}, false)`,
			})
			.from(episodeRelease)
			.innerJoin(
				seriesEpisode,
				and(
					eq(seriesEpisode.anilistId, episodeRelease.anilistId),
					eq(seriesEpisode.anilistEpisode, episodeRelease.anilistEpisode),
				),
			)
			.innerJoin(seriesSeason, eq(seriesSeason.id, seriesEpisode.seasonId))
			.innerJoin(series, eq(series.id, seriesSeason.seriesId))
			.innerJoin(
				libraryEntry,
				and(eq(libraryEntry.userId, userId), eq(libraryEntry.seriesId, seriesSeason.seriesId)),
			)
			.leftJoin(
				playbackProgress,
				and(
					eq(playbackProgress.userId, userId),
					eq(playbackProgress.anilistId, episodeRelease.anilistId),
					eq(playbackProgress.episode, episodeRelease.anilistEpisode),
				),
			)
			.where(
				and(
					eq(episodeRelease.news, true),
					gt(episodeRelease.releasedAt, libraryEntry.createdAt),
					gt(episodeRelease.releasedAt, since),
				),
			),
		db
			.select({
				seenAt: notificationSeen.seenAt,
			})
			.from(notificationSeen)
			.where(eq(notificationSeen.userId, userId))
			.limit(1),
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

	const seasonIds = [...new Set(episodes.map((episode) => episode.seasonId))];
	const firstReleases = seasonIds.length
		? await db
				.select({
					seasonId: seriesEpisode.seasonId,
					at: min(episodeRelease.releasedAt),
				})
				.from(episodeRelease)
				.innerJoin(
					seriesEpisode,
					and(
						eq(seriesEpisode.anilistId, episodeRelease.anilistId),
						eq(seriesEpisode.anilistEpisode, episodeRelease.anilistEpisode),
					),
				)
				.where(inArray(seriesEpisode.seasonId, seasonIds))
				.groupBy(seriesEpisode.seasonId)
		: [];

	const all = groupNotifications(
		episodes,
		new Map(firstReleases.flatMap((row) => (row.at ? [[row.seasonId, row.at]] : []))),
		seen?.seenAt ?? null,
		new Set(dismissals.map((row) => row.notificationId)),
		new Set(reads.map((row) => row.notificationId)),
	);
	const groups = all.slice(0, options.limit ?? 30);

	const seriesIds = [...new Set(groups.map((group) => group.seriesId))];
	const cards = seriesIds.length
		? await toSeriesCards(await db.select().from(series).where(inArray(series.id, seriesIds)))
		: new Map<string, SeriesCard>();

	const items = groups.flatMap(({ seriesId, ...group }): Notification[] => {
		const card = cards.get(seriesId);
		return card
			? [
					{
						...group,
						series: card,
					},
				]
			: [];
	});

	return {
		items,
		unread: all.filter((group) => group.unread).length,
	};
}

/**
 * Marks all of a user's notifications read up to `seenAt`: those released by then
 * are no longer unread. Pass the `releasedAt` of the newest notification
 * shown, so one that came out meanwhile stays unread. It never moves back,
 * nor past now.
 */
export async function markNotificationsSeen(userId: string, seenAt: Date) {
	const now = new Date();
	const at = seenAt > now ? now : seenAt;
	await db
		.insert(notificationSeen)
		.values({
			userId,
			seenAt: at,
		})
		.onConflictDoUpdate({
			target: notificationSeen.userId,
			set: {
				seenAt: sql`greatest(${notificationSeen.seenAt}, excluded.seen_at)`,
			},
		});
}

/**
 * Marks one of a user's notifications read. Marking one that is not listed,
 * or already read, changes nothing.
 *
 * @param notificationId - A `Notification.id`.
 */
export async function markNotificationRead(userId: string, notificationId: string) {
	await db
		.insert(notificationRead)
		.values({
			userId,
			notificationId,
			readAt: new Date(),
		})
		.onConflictDoNothing();
}

/**
 * Deletes one of a user's notifications, so it is never listed again.
 * Deleting one that is not listed, or already deleted, changes nothing.
 *
 * @param notificationId - A `Notification.id`.
 */
export async function dismissNotification(userId: string, notificationId: string) {
	await db
		.insert(notificationDismissal)
		.values({
			userId,
			notificationId,
			dismissedAt: new Date(),
		})
		.onConflictDoNothing();
}
