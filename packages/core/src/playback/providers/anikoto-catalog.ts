import { hour } from "@sora/shared";
import type { HttpClient } from "anime-sdk";
import { and, eq, isNotNull, max, notExists, notInArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../../database/client";
import { anikotoSeries, providerMapping } from "../../database/schema/playback";
import { Rows } from "./rows";
import { apiUrl } from "./search";
import { Series } from "./series";

const CatalogPageSchema = z.object({
	data: z.array(z.json()),
	pagination: z.object({
		page: z.number().int(),
		total_pages: z.number().int().nonnegative(),
	}),
});

/** A series AniKoto changed, as its catalogue listing gives it. */
export interface AniKotoChange {
	anikotoId: number;
	/** The AniList entry AniKoto files the series under, when it says. */
	anilistId: number | null;
	updatedAt: Date;
}

export const aniKotoCatalog = {
	/**
	 * Reads the series AniKoto changed since `since`, newest first, from the
	 * start of its catalogue listing: page after page until one reaches back
	 * past `since`, up to five pages. AniKoto changes about 50
	 * series a day, so one page usually covers hours, but it adds new series
	 * in bursts of dozens. Adding an episode or a dub changes its series,
	 * though the series' timestamp may trail the episode's by a few minutes.
	 *
	 * The series are stored in the mirror too, so a series that just premiered
	 * can be matched without waiting for the hourly sync.
	 *
	 * @throws {Error} when AniKoto's API fails.
	 */
	async recentChanges(http: HttpClient, since: Date): Promise<AniKotoChange[]> {
		/** Catalogue pages {@link aniKotoCatalog.recentChanges} reads at most, 20 series each. */
		const recentPageLimit = 5;

		const changes: AniKotoChange[] = [];

		const readPage = async (page: number): Promise<void> => {
			const response = await http.get(`${apiUrl}/recent-anime?page=${page}`);
			const body = await response.json();

			const rows = CatalogPageSchema.parse(body).data.flatMap((item) => new Series(item).row ?? []);

			await new Rows(rows).store();
			changes.push(
				...rows.map((row) => ({
					anikotoId: row.anikotoId,
					anilistId: row.anilistId ?? null,
					updatedAt: row.updatedAt,
				})),
			);

			const oldest = rows.at(-1);

			const more = oldest && oldest.updatedAt >= since && page < recentPageLimit;

			if (more) {
				await readPage(page + 1);
			}
		};

		await readPage(1);

		return changes;
	},

	/**
	 * Mirrors AniKoto's catalogue into `anikoto_series`.
	 *
	 * AniKoto lists its catalogue newest change first. An incremental sync stops
	 * at the first page older than what is stored; a full sync reads every page
	 * and then drops series AniKoto no longer lists. A series that fails to parse
	 * is skipped rather than failing its page, and then nothing is dropped.
	 *
	 * @param options.full - Read the whole catalogue, as when it was never synced.
	 * @returns How many pages were read and how many series were stored.
	 * @throws {Error} when AniKoto's API fails; series stored before the failure are kept.
	 */
	async sync(
		http: HttpClient,
		options: {
			full: boolean;
			signal?: AbortSignal;
		},
	) {
		/**
		 * An incremental sync re-reads series changed this long before the newest
		 * one stored, so a series AniKoto updated while a sync was paging through
		 * its catalogue is not skipped. Paging takes seconds, and AniKoto changes
		 * about 50 series a day, so this rarely costs a second page.
		 */
		const syncOverlapMs = 2 * hour;

		const [
			{ newest } = {
				newest: null,
			},
		] = await db
			.select({
				newest: max(anikotoSeries.updatedAt),
			})
			.from(anikotoSeries);

		const full = options.full || newest === null;
		let cutoff: Date | null = null;

		if (newest !== null) {
			cutoff = new Date(newest.getTime() - syncOverlapMs);
		}

		const seen: number[] = [];
		let allRead = true;
		let pages = 0;
		let stored = 0;

		const readPage = async (
			page: number,
		): Promise<{
			pages: number;
			stored: number;
		}> => {
			const response = await http.get(`${apiUrl}/recent-anime?page=${page}`, {
				signal: options.signal,
			});

			const listing = CatalogPageSchema.parse(await response.json());
			pages += 1;

			const rows = listing.data.flatMap((item) => {
				const { row } = new Series(item);
				allRead &&= row !== null;

				if (row) {
					return [row];
				}

				return [];
			});

			seen.push(...rows.map((row) => row.anikotoId));
			stored += await new Rows(rows).store();

			const isLastPage = page >= listing.pagination.total_pages || listing.data.length === 0;
			const isCaughtUp = !full && cutoff !== null && rows.every((row) => row.updatedAt < cutoff);

			if (isLastPage || isCaughtUp) {
				// A series that failed to parse was not seen, but may still be listed.
				const complete = full && isLastPage && allRead;

				if (complete) {
					await db.delete(anikotoSeries).where(notInArray(anikotoSeries.anikotoId, seen));
					// Mappings to series AniKoto no longer lists are dropped, so the next
					// look finds the anime's entry again. AniKoto re-files a title under a
					// new series and removes the old one or the new one (Rascal Does Not
					// Dream of a Sister Venturing Out was re-matched to a series that no
					// longer exists), and a mapping to a series the mirror dropped is
					// otherwise trusted for 30 days with no episodes behind it.
					await db.delete(providerMapping).where(
						and(
							eq(providerMapping.provider, Rows.provider),
							isNotNull(providerMapping.providerMediaId),
							notExists(
								db
									.select({
										one: sql`1`,
									})
									.from(anikotoSeries)
									.where(
										sql`${anikotoSeries.anikotoId}::text = ${providerMapping.providerMediaId}`,
									),
							),
						),
					);
				}

				return {
					pages,
					stored,
				};
			}

			return await readPage(page + 1);
		};

		return await readPage(1);
	},
};
