import { inSequence } from "@sora/shared";
import { and, asc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { episodeProgress, seriesState } from "../../database/schema/library";
import { series, seriesEpisode } from "../../database/schema/series";
import { InvalidInputError } from "../../errors";
import type { WatchlistStatus } from "../../models/library";
import { LibraryImportSchema } from "../../models/transfer";
import type { LibraryExport, LibraryImport, LibraryImportReport } from "../../models/transfer";
import { scheduleSeriesStore } from "../../scheduler/queue";
import { episodeReleasedAt } from "../../series/episodes";
import { storedSeriesIds } from "../../series/store";
import { readAniListAccount, readMyAnimeListAccount } from "./oauth";
import { fromMyAnimeList, parseMyAnimeListExport, readAniListUser } from "./sources";
import type { ListEntry, MalEntry } from "./sources";

/** Rows written by one statement, so none outgrows the database's parameter limit. */
const batchSize = 1000;

/** The titles listed in a report, and the most a single import asks the scheduler to add. */
const reportedTitles = 50;
const queuedTitles = 100;

/**
 * A profile's watchlist and history as a file, by AniList ID so another
 * Sora, or this one later, can take it back with {@link importLibrary}.
 */
export const exportLibrary = async (userId: string, now = new Date()): Promise<LibraryExport> => {
	const [watchlist, history] = await Promise.all([
		db
			.select({
				addedAt: seriesState.addedAt,
				anilistId: series.anilistId,
				status: seriesState.status,
				title: series.title,
			})
			.from(seriesState)
			.innerJoin(series, eq(series.id, seriesState.seriesId))
			.where(and(eq(seriesState.userId, userId), sql`${seriesState.status} is not null`))
			.orderBy(asc(seriesState.addedAt)),
		db
			.select({
				anilistId: series.anilistId,
				durationSeconds: episodeProgress.durationSeconds,
				episode: episodeProgress.episode,
				finished: episodeProgress.finished,
				positionSeconds: episodeProgress.positionSeconds,
				rewatch: episodeProgress.rewatch,
				watchedAt: episodeProgress.watchedAt,
			})
			.from(episodeProgress)
			.innerJoin(series, eq(series.id, episodeProgress.seriesId))
			.where(eq(episodeProgress.userId, userId))
			.orderBy(asc(episodeProgress.watchedAt)),
	]);

	return {
		exported_at: now.toISOString(),
		format: "sora-library",
		history: history.map((row) => ({
			anilist_id: row.anilistId,
			duration_seconds: row.durationSeconds,
			episode: row.episode,
			finished: row.finished,
			position_seconds: row.positionSeconds,
			rewatch: row.rewatch,
			watched_at: row.watchedAt.toISOString(),
		})),
		version: 1,
		watchlist: watchlist.flatMap((row) =>
			row.status && row.addedAt
				? [
						{
							added_at: row.addedAt.toISOString(),
							anilist_id: row.anilistId,
							status: row.status,
							title: row.title,
						},
					]
				: [],
		),
	};
};

/** What an import adds for one title: its place on the watchlist and the episodes it was watched through. */
interface Addition {
	anilistId: number;
	title: string | null;
	status: WatchlistStatus | null;
	addedAt: Date;
	/** Episodes from the first to watch through; `null` for every episode released. */
	through: number | null | undefined;
	/** Episodes exactly as a file recorded them. */
	played: LibraryExport["history"];
}

const chunks = <T>(items: readonly T[]) =>
	Array.from({ length: Math.ceil(items.length / batchSize) }, (_, index) =>
		items.slice(index * batchSize, (index + 1) * batchSize),
	);

/**
 * Adds titles and episodes to a profile without changing what it already
 * has: a title already on its watchlist keeps its status, and an episode
 * already played keeps where it was. A title Sora does not hold yet is
 * reported, and queued for the scheduler to add so a later import takes it.
 */
const applyAdditions = async (
	userId: string,
	additions: readonly Addition[],
	now: Date,
): Promise<LibraryImportReport> => {
	const stored = await storedSeriesIds(additions.map((addition) => addition.anilistId));
	const missing = additions.filter((addition) => !stored.has(addition.anilistId));
	const present = additions.flatMap((addition) => {
		const seriesId = stored.get(addition.anilistId);
		return seriesId === undefined ? [] : [{ ...addition, seriesId }];
	});

	let watchlistAdded = 0;
	let episodesAdded = 0;
	await db.transaction(async (tx) => {
		const listed = present.flatMap((addition) =>
			addition.status
				? [
						{
							addedAt: addition.addedAt,
							seriesId: addition.seriesId,
							status: addition.status,
							statusChangedAt: addition.addedAt,
							userId,
						},
					]
				: [],
		);
		await inSequence(chunks(listed), async (batch) => {
			const written = await tx
				.insert(seriesState)
				.values(batch)
				.onConflictDoUpdate({
					set: {
						addedAt: sql`excluded.added_at`,
						status: sql`excluded.status`,
						statusChangedAt: sql`excluded.status_changed_at`,
					},
					setWhere: isNull(seriesState.status),
					target: [seriesState.userId, seriesState.seriesId],
				})
				.returning({
					seriesId: seriesState.seriesId,
				});
			watchlistAdded += written.length;
		});

		const recorded = present.flatMap((addition) =>
			addition.played.map((row) => ({
				durationSeconds: row.duration_seconds,
				episode: row.episode,
				finished: row.finished,
				positionSeconds: row.position_seconds,
				rewatch: row.rewatch,
				seriesId: addition.seriesId,
				userId,
				watchedAt: new Date(row.watched_at),
			})),
		);

		const through = present.filter((addition) => addition.through !== undefined);
		const released = through.length
			? await tx
					.select({
						number: seriesEpisode.number,
						runtimeMinutes: seriesEpisode.runtimeMinutes,
						seriesId: seriesEpisode.seriesId,
					})
					.from(seriesEpisode)
					.where(
						and(
							inArray(
								seriesEpisode.seriesId,
								through.map((addition) => addition.seriesId),
							),
							or(
								and(isNull(seriesEpisode.airedAt), isNull(seriesEpisode.airDate)),
								lte(episodeReleasedAt, now),
							),
						),
					)
			: [];
		const limits = new Map(through.map((addition) => [addition.seriesId, addition.through]));
		const watched = released.flatMap((episode) => {
			const limit = limits.get(episode.seriesId);
			if (limit !== null && limit !== undefined && episode.number > limit) {
				return [];
			}

			const durationSeconds = (episode.runtimeMinutes ?? 0) * 60;
			return [
				{
					durationSeconds,
					episode: episode.number,
					finished: true,
					positionSeconds: durationSeconds,
					rewatch: false,
					seriesId: episode.seriesId,
					userId,
					watchedAt: now,
				},
			];
		});

		await inSequence(chunks([...recorded, ...watched]), async (batch) => {
			const written = await tx
				.insert(episodeProgress)
				.values(batch)
				.onConflictDoNothing()
				.returning({
					episode: episodeProgress.episode,
				});
			episodesAdded += written.length;
		});
	});

	await Promise.all(
		missing
			.slice(0, queuedTitles)
			.map((addition) => scheduleSeriesStore(addition.anilistId, "backfill")),
	);

	return {
		episodes_added: episodesAdded,
		not_in_sora: missing.slice(0, reportedTitles).map((addition) => ({
			anilist_id: addition.anilistId,
			title: addition.title,
		})),
		not_in_sora_count: missing.length,
		watchlist_added: watchlistAdded,
		watchlist_kept: present.filter((addition) => addition.status).length - watchlistAdded,
	};
};

const fromList = (entries: readonly ListEntry[], now: Date): Addition[] =>
	entries.map((entry) => ({
		addedAt: now,
		anilistId: entry.anilistId,
		played: [],
		status: entry.status,
		through: entry.through,
		title: entry.title,
	}));

const fromFile = (file: LibraryExport): Addition[] => {
	const additions = new Map<number, Addition>();
	const of = (anilistId: number, title: string | null) => {
		const known = additions.get(anilistId);
		if (known) {
			return known;
		}

		const added: Addition = {
			addedAt: new Date(),
			anilistId,
			played: [],
			status: null,
			through: undefined,
			title,
		};
		additions.set(anilistId, added);
		return added;
	};
	for (const entry of file.watchlist) {
		const addition = of(entry.anilist_id, entry.title);
		addition.status = entry.status;
		addition.addedAt = new Date(entry.added_at);
	}

	for (const row of file.history) {
		of(row.anilist_id, null).played.push(row);
	}

	return [...additions.values()];
};

/** Adds MyAnimeList titles, and reports those Sora has no AniList entry for. */
const applyMyAnimeList = async (
	userId: string,
	entries: readonly MalEntry[],
	now: Date,
): Promise<LibraryImportReport> => {
	const { matched, unmatched } = await fromMyAnimeList(entries);
	const report = await applyAdditions(userId, fromList(matched, now), now);
	return {
		...report,
		not_in_sora: [
			...report.not_in_sora,
			...unmatched.map((entry) => ({
				anilist_id: null,
				title: entry.title,
			})),
		].slice(0, reportedTitles),
		not_in_sora_count: report.not_in_sora_count + unmatched.length,
	};
};

/**
 * Puts what a file or another site's list holds into a profile: a Sora
 * export, an AniList user's public list, or a MyAnimeList export. It only
 * adds. See {@link applyAdditions} for what stays as it is.
 *
 * From another site a title is put on the watchlist with its status, and
 * the episodes up to the ones watched are marked watched, as
 * `markWatched` would. A completed title has every released episode marked.
 *
 * @throws {InvalidInputError} when the import fails {@link LibraryImportSchema},
 *   or the AniList user is unknown or private.
 * @throws {UpstreamUnavailableError} when AniList cannot be reached.
 */
export const importLibrary = async (
	userId: string,
	request: LibraryImport,
	now = new Date(),
): Promise<LibraryImportReport> => {
	const parsed = LibraryImportSchema.safeParse(request);
	if (!parsed.success) {
		throw new InvalidInputError("Invalid import", {
			cause: parsed.error,
		});
	}

	const { data } = parsed;
	if (data.source === "sora") {
		return await applyAdditions(userId, fromFile(data.document), now);
	}
	if (data.source === "anilist" || data.source === "anilist_account") {
		const entries =
			data.source === "anilist"
				? await readAniListUser(data.username)
				: await readAniListAccount(data.authorization);
		return await applyAdditions(userId, fromList(entries, now), now);
	}

	const malEntries =
		data.source === "myanimelist"
			? parseMyAnimeListExport(data.xml)
			: await readMyAnimeListAccount(data.authorization);
	return await applyMyAnimeList(userId, malEntries, now);
};
