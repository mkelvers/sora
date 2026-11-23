import { sequence } from "@sora/shared";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import {
	episodeProgress,
	importConnection,
	importRecord,
	seriesState,
} from "../../database/schema/library";
import { series } from "../../database/schema/series";
import { InvalidInputError } from "../../errors";
import { ImportConnectionSchema, LibraryImportSchema } from "../../models/transfer";
import type {
	ImportConnection,
	ImportUndo,
	LibraryExport,
	LibraryImport,
	LibraryImportReport,
} from "../../models/transfer";
import { Batches } from "./batches";
import { Importer } from "./importer";
import { readAnilistAccount, readMalAccount } from "./oauth";
import { parseMalExport, readAnilist } from "./sources";

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
				changedAt: seriesState.statusChangedAt,
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
		watchlist: watchlist.flatMap((row) => {
			if (row.status && row.addedAt) {
				return [
					{
						added_at: row.addedAt.toISOString(),
						anilist_id: row.anilistId,
						changed_at: (row.changedAt ?? row.addedAt).toISOString(),
						status: row.status,
						title: row.title,
					},
				];
			}

			return [];
		}),
	};
};

/**
 * Puts what a file or another site's list holds into a profile: a Sora
 * export, an AniList user's public list, or a MyAnimeList export. It only
 * adds. See {@link Importer.add} for what stays as it is.
 *
 * From another site a title is put on the watchlist with its status, and
 * the episodes up to the ones watched are marked watched, as
 * `progress.markWatched` would. A completed title has every released episode marked.
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

	const importer = new Importer(userId, now);

	if (data.source === "sora") {
		return await importer.add(Importer.file(data.document));
	}

	if (data.source === "anilist") {
		return await importer.add(importer.from(await readAnilist(data.username)));
	}

	if (data.source === "anilist_account") {
		const { account, entries } = await readAnilistAccount(data.authorization);
		await importer.remember(data.source, account);

		return await importer.add(importer.from(entries));
	}

	if (data.source === "myanimelist_account") {
		const { account, entries } = await readMalAccount(data.authorization);
		await importer.remember(data.source, account);

		return await importer.addMal(entries);
	}

	return await importer.addMal(parseMalExport(data.xml));
};

/** The accounts a profile connected to import from. */
export const listImportConnections = async (userId: string): Promise<ImportConnection[]> => {
	const rows = await db.select().from(importConnection).where(eq(importConnection.userId, userId));

	return rows.map((row) =>
		ImportConnectionSchema.parse({
			account_name: row.accountName,
			connected_at: row.connectedAt.toISOString(),
			source: row.source,
		}),
	);
};

/** Forgets a connected account. What it imported stays; one never connected is left alone. */
export const disconnectImport = async (userId: string, source: ImportConnection["source"]) => {
	await db
		.delete(importConnection)
		.where(and(eq(importConnection.userId, userId), eq(importConnection.source, source)));
};

/**
 * Takes back what an import added: the titles it put on the watchlist and
 * the episodes it marked watched. Only the profile's latest import can be
 * undone; `importId` that is not it, or already undone, undoes nothing.
 */
export const undoImport = async (userId: string, importId: string): Promise<ImportUndo> => {
	const undone: ImportUndo = {
		episodes_removed: 0,
		watchlist_removed: 0,
	};

	await db.transaction(async (tx) => {
		const [record] = await tx
			.select()
			.from(importRecord)
			.where(and(eq(importRecord.userId, userId), eq(importRecord.id, importId)))
			.limit(1);

		if (!record) {
			return;
		}

		const seriesIds = z.array(z.string()).parse(record.seriesIds);
		const episodes = z.array(z.tuple([z.string(), z.number(), z.boolean()])).parse(record.episodes);
		await sequence.all(new Batches(episodes).all, async (batch) => {
			const rows = JSON.stringify(
				batch.map(([seriesId, episode, rewatch]) => ({
					e: episode,
					r: rewatch,
					s: seriesId,
				})),
			);

			const removed = await tx.execute(sql`
				delete from episode_progress as progress
				using jsonb_to_recordset(${rows}::text::jsonb) as added(s text, e int, r boolean)
				where progress.user_id = ${userId}
					and progress.series_id = added.s
					and progress.episode = added.e
					and progress.rewatch = added.r
				returning 1
			`);

			undone.episodes_removed += removed.length;
		});

		await sequence.all(new Batches(seriesIds).all, async (batch) => {
			const cleared = await tx
				.update(seriesState)
				.set({
					addedAt: null,
					status: null,
					statusChangedAt: null,
				})
				.where(and(eq(seriesState.userId, userId), inArray(seriesState.seriesId, batch)))
				.returning({
					seriesId: seriesState.seriesId,
				});

			undone.watchlist_removed += cleared.length;
			await tx
				.delete(seriesState)
				.where(
					and(
						eq(seriesState.userId, userId),
						inArray(seriesState.seriesId, batch),
						isNull(seriesState.status),
						isNull(seriesState.rewatchStartedAt),
						isNull(seriesState.dismissedAt),
					),
				);
		});

		await tx.delete(importRecord).where(eq(importRecord.userId, userId));
	});

	return undone;
};
