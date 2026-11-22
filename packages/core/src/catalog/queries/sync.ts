import { attempt, hour, minute } from "@sora/shared";
import { and, inArray, notInArray, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";

import { anilist } from "../../anilist/client";
import { SearchIndexPageDocument } from "../../anilist/graphql.generated";
import type { MediaSort, SearchIndexPageQuery } from "../../anilist/graphql.generated";
import { zSearchIndexPageQuery } from "../../anilist/validation.generated";
import { db } from "../../database/client";
import { animeSearch, animeSearchTag, catalogSync } from "../../database/schema/catalog";
import { UpstreamUnavailableError } from "../../errors";
import { IndexedEntry } from "./indexed-entry";
import type { IndexedMedia } from "./indexed-entry";

/** The search index's row in `catalog_sync`. */
export const catalogName = "anime_search";

/** One run bringing the search index up to date with AniList; see `syncSearchIndex`. */
export class Sync {
	/** AniList serves at most this many pages of 50 for one filter. */
	static readonly #pagesPerWindow = 100;

	readonly #full: boolean;
	readonly #cutoff: Date | null;
	readonly #sort: MediaSort[];
	#pages = 0;
	#stored = 0;

	/**
	 * A full sync reads the whole catalogue, most popular first; an
	 * incremental one reads the most recently changed entries until all of a
	 * page changed before `cutoff`.
	 */
	constructor(full: boolean, cutoff: Date | null) {
		this.#full = full;
		this.#cutoff = cutoff;
		this.#sort = ["UPDATED_AT_DESC"];

		if (full) {
			this.#sort = ["POPULARITY_DESC", "ID"];
		}
	}

	/**
	 * Reads the catalogue from the entries less popular than
	 * `popularityBelow`, or from the start, window after window.
	 *
	 * @returns How many pages were read and how many entries were stored.
	 */
	async window(popularityBelow: number | undefined): Promise<{
		pages: number;
		stored: number;
	}> {
		let leastPopular: number | undefined;

		const readPage = async (
			page: number,
		): Promise<{
			pages: number;
			stored: number;
		} | null> => {
			const { Page } = await this.#page(page, popularityBelow);
			this.#pages += 1;

			const media = (Page?.media ?? []).flatMap((entry) => {
				if (entry) {
					return [entry];
				}

				return [];
			});

			const rows = await this.#store(media);
			leastPopular = rows.at(-1)?.popularity ?? leastPopular;

			const cutoff = this.#cutoff;

			const isCaughtUp =
				!this.#full && cutoff !== null && rows.every((row) => row.updatedAt < cutoff);

			if (Page?.pageInfo?.hasNextPage !== true || isCaughtUp) {
				if (this.#full && !isCaughtUp) {
					const values = {
						fullSyncAt: new Date(),
					};

					await db
						.insert(catalogSync)
						.values({
							catalog: catalogName,
							...values,
						})
						.onConflictDoUpdate({
							set: values,
							target: catalogSync.catalog,
						});
				}

				return {
					pages: this.#pages,
					stored: this.#stored,
				};
			}

			if (page >= Sync.#pagesPerWindow) {
				return null;
			}

			return await readPage(page + 1);
		};

		const finished = await readPage(1);

		if (finished) {
			return finished;
		}

		// An incremental sync that has not caught up after a whole window has
		// fallen too far behind; the weekly full sync covers the rest.
		if (!this.#full) {
			return {
				pages: this.#pages,
				stored: this.#stored,
			};
		}

		const nextBelow = (leastPopular ?? 0) + 1;

		if (popularityBelow !== undefined && nextBelow >= popularityBelow) {
			throw new Error(
				`More than ${Sync.#pagesPerWindow * 50} anime share popularity ${leastPopular}; the search index cannot page past them`,
			);
		}

		return await this.window(nextBelow);
	}

	/** One page of the catalogue, waiting out AniList's rate limit when it is hit. */
	async #page(
		page: number,
		popularityBelow: number | undefined,
		tries = 1,
	): Promise<SearchIndexPageQuery> {
		/**
		 * Times a sync waits out AniList's rate limit on one page before giving up.
		 * A full sync makes hundreds of requests, so it runs into the limit whenever
		 * anything else on the host uses AniList meanwhile.
		 */
		const pageAttempts = 5;

		const { data, error } = await attempt(
			anilist(
				SearchIndexPageDocument,
				{
					page,
					popularityBelow,
					sort: this.#sort,
				},
				zSearchIndexPageQuery,
				{
					// Long enough for a failed sync to resume where it stopped.
					maxAgeMs: hour,
				},
			),
			UpstreamUnavailableError,
		);

		if (!error) {
			return data;
		}

		if (tries >= pageAttempts) {
			throw error;
		}

		await Bun.sleep(error.retryAfterMs ?? minute);

		return await this.#page(page, popularityBelow, tries + 1);
	}

	/**
	 * Stores a page's entries and their tags, and returns the entries' rows.
	 *
	 * A stored row is rewritten only when something in it changed: a sync
	 * reads thousands of unchanged entries, and each rewrite leaves a dead row
	 * and new trigram index entries behind. Tags AniList no longer lists for
	 * the entries are removed, and a stored one is rewritten only when it
	 * changed.
	 */
	async #store(media: IndexedMedia[]) {
		const rows = media.map((entry) => new IndexedEntry(entry).row);

		if (rows.length > 0) {
			const keys = Object.keys(rows[0] ?? {}).filter((key) => key !== "anilistId");

			const pairs = keys.map(
				(key) => [key, key.replaceAll(/[A-Z]/gu, (letter) => `_${letter.toLowerCase()}`)] as const,
			);

			const columns = pairs.map(([, column]) => column);

			await db
				.insert(animeSearch)
				.values(rows)
				.onConflictDoUpdate({
					set: Object.fromEntries(
						pairs.map(([key, column]) => [key, sql.raw(`excluded.${column}`)]),
					),
					setWhere: sql.raw(
						`(${columns.map((column) => `anime_search.${column}`).join(", ")}) is distinct from (${columns.map((column) => `excluded.${column}`).join(", ")})`,
					),
					target: animeSearch.anilistId,
				});

			this.#stored += rows.length;
		}

		const anilistIds = rows.map((row) => row.anilistId);
		const tags = media.flatMap((entry) => new IndexedEntry(entry).tags);

		if (anilistIds.length === 0) {
			return rows;
		}

		const kept = tags.map((tag) => `${tag.anilistId}:${tag.tag}`);

		await db.transaction(async (tx) => {
			let gone: SQL | undefined;

			if (kept.length > 0) {
				gone = notInArray(sql`${animeSearchTag.anilistId} || ':' || ${animeSearchTag.tag}`, kept);
			}

			await tx
				.delete(animeSearchTag)
				.where(and(inArray(animeSearchTag.anilistId, anilistIds), gone));

			if (tags.length === 0) {
				return;
			}

			await tx
				.insert(animeSearchTag)
				.values(tags)
				.onConflictDoUpdate({
					set: {
						adult: sql`excluded.adult`,
						rank: sql`excluded.rank`,
						spoiler: sql`excluded.spoiler`,
					},
					setWhere: sql`(${animeSearchTag.rank}, ${animeSearchTag.spoiler}, ${animeSearchTag.adult}) is distinct from (excluded.rank, excluded.spoiler, excluded.adult)`,
					target: [animeSearchTag.anilistId, animeSearchTag.tag],
				});
		});

		return rows;
	}
}
