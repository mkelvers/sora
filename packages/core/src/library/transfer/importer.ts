import { sequence } from "@sora/shared";
import { and, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";

import { db } from "../../database/client";
import {
	episodeProgress,
	importConnection,
	importRecord,
	seriesState,
} from "../../database/schema/library";
import { seriesEpisode } from "../../database/schema/series";
import type { WatchlistStatus } from "../../models/library";
import type { ImportConnection, LibraryExport, LibraryImportReport } from "../../models/transfer";
import { scheduleSeriesStore } from "../../scheduler/queue";
import { episodeReleasedAt } from "../../series/episodes";
import { storedSeriesIds } from "../../series/store";
import { Batches } from "./batches";
import { fromMal } from "./sources";
import type { ListEntry, MalEntry } from "./sources";

/** What an import adds for one title: its place on the watchlist and the episodes it was watched through. */
export interface Addition {
	anilistId: number;
	title: string | null;
	status: WatchlistStatus | null;
	addedAt: Date;
	/** When the status last changed; the day it was added if the source has no later date. */
	changedAt: Date;
	/** Episodes from the first to watch through; `null` for every episode released. */
	through: number | null | undefined;
	/** Episodes exactly as a file recorded them. */
	played: LibraryExport["history"];
}

/** Imports into one profile at one moment. */
export class Importer {
	/** The titles listed in a report, and the most a single import asks the scheduler to add. */
	static readonly #reported = 50;

	readonly #userId: string;
	readonly #now: Date;

	constructor(userId: string, now: Date) {
		this.#userId = userId;
		this.#now = now;
	}

	/** What a Sora export adds. */
	static file(file: LibraryExport): Addition[] {
		const additions = new Map<number, Addition>();

		const of = (anilistId: number, title: string | null) => {
			const known = additions.get(anilistId);

			if (known) {
				return known;
			}

			const added: Addition = {
				addedAt: new Date(),
				anilistId,
				changedAt: new Date(),
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
			addition.changedAt = new Date(entry.changed_at ?? entry.added_at);
		}

		for (const row of file.history) {
			of(row.anilist_id, null).played.push(row);
		}

		return [...additions.values()];
	}

	/**
	 * Adds titles and episodes to a profile without changing what it already
	 * has: a title already on its watchlist keeps its status, and an episode
	 * already played keeps where it was. A title Sora does not hold yet is
	 * reported, and queued for the scheduler to add so a later import takes it.
	 */
	async add(additions: readonly Addition[]): Promise<LibraryImportReport> {
		const userId = this.#userId;
		const now = this.#now;

		const stored = await storedSeriesIds(additions.map((addition) => addition.anilistId));
		const missing = additions.filter((addition) => !stored.has(addition.anilistId));

		const present = additions.flatMap((addition) => {
			const seriesId = stored.get(addition.anilistId);

			if (seriesId === undefined) {
				return [];
			}

			return [
				{
					...addition,
					seriesId,
				},
			];
		});

		const addedSeriesIds: string[] = [];
		const addedEpisodes: [string, number, boolean][] = [];
		let importId: string | null = null;
		await db.transaction(async (tx) => {
			const listed = present.flatMap((addition) => {
				if (addition.status) {
					return [
						{
							addedAt: addition.addedAt,
							seriesId: addition.seriesId,
							status: addition.status,
							statusChangedAt: addition.changedAt,
							userId,
						},
					];
				}

				return [];
			});

			await sequence.all(new Batches(listed).all, async (batch) => {
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

				addedSeriesIds.push(...written.map((row) => row.seriesId));
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

			let released: {
				number: number;
				runtimeMinutes: number | null;
				seriesId: string;
			}[] = [];

			if (through.length) {
				released = await tx
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
					);
			}

			const limits = new Map(through.map((addition) => [addition.seriesId, addition.through]));

			const watched = released.flatMap((episode) => {
				const limit = limits.get(episode.seriesId);

				const pastLimit = limit !== null && limit !== undefined && episode.number > limit;

				if (pastLimit) {
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

			await sequence.all(new Batches([...recorded, ...watched]).all, async (batch) => {
				const written = await tx
					.insert(episodeProgress)
					.values(batch)
					.onConflictDoNothing()
					.returning({
						episode: episodeProgress.episode,
						rewatch: episodeProgress.rewatch,
						seriesId: episodeProgress.seriesId,
					});

				addedEpisodes.push(
					...written.map((row): [string, number, boolean] => [
						row.seriesId,
						row.episode,
						row.rewatch,
					]),
				);
			});

			await tx.delete(importRecord).where(eq(importRecord.userId, userId));

			if (addedSeriesIds.length || addedEpisodes.length) {
				importId = crypto.randomUUID();
				await tx.insert(importRecord).values({
					episodes: addedEpisodes,
					id: importId,
					seriesIds: addedSeriesIds,
					userId,
				});
			}
		});

		await Promise.all(
			missing.slice(0, 100).map((addition) => scheduleSeriesStore(addition.anilistId, "backfill")),
		);

		return {
			episodes_added: addedEpisodes.length,
			import_id: importId,
			not_in_sora: missing.slice(0, Importer.#reported).map((addition) => ({
				anilist_id: addition.anilistId,
				title: addition.title,
			})),
			not_in_sora_count: missing.length,
			watchlist_added: addedSeriesIds.length,
			watchlist_kept: present.filter((addition) => addition.status).length - addedSeriesIds.length,
		};
	}

	/** Adds MyAnimeList titles, and reports those Sora has no AniList entry for. */
	async addMal(entries: readonly MalEntry[]): Promise<LibraryImportReport> {
		const { matched, unmatched } = await fromMal(entries);
		const report = await this.add(this.from(matched));

		return {
			...report,
			not_in_sora: [
				...report.not_in_sora,
				...unmatched.map((entry) => ({
					anilist_id: null,
					title: entry.title,
				})),
			].slice(0, Importer.#reported),
			not_in_sora_count: report.not_in_sora_count + unmatched.length,
		};
	}

	/** Remembers the account a profile connected to import from. */
	async remember(source: ImportConnection["source"], accountName: string) {
		const userId = this.#userId;

		await db
			.insert(importConnection)
			.values({
				accountName,
				source,
				userId,
			})
			.onConflictDoUpdate({
				set: {
					accountName,
					connectedAt: new Date(),
				},
				target: [importConnection.userId, importConnection.source],
			});
	}

	/** What a list kept elsewhere adds. */
	from(entries: readonly ListEntry[]): Addition[] {
		return entries.map((entry) => ({
			addedAt: this.#notAfter(entry.addedAt),
			anilistId: entry.anilistId,
			changedAt: this.#notAfter(entry.changedAt ?? entry.addedAt),
			played: [],
			status: entry.status,
			through: entry.through,
			title: entry.title,
		}));
	}

	/**
	 * A date a list gave, no later than now: a clock set wrong on the other
	 * side must not put a title ahead of everything the person does next.
	 */
	#notAfter(date: Date | null) {
		const now = this.#now;

		if (date && date < now) {
			return date;
		}

		return now;
	}
}
