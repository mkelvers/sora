import { attempt, inSequence, chunked } from "@sora/shared";
import { eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../database/client";
import { tmdbHint } from "../database/schema/series";
import { UpstreamUnavailableError } from "../errors";

/**
 * A list with fewer hints than this share of those stored is taken for a
 * broken upstream rather than titles removed, and is not applied. The list
 * only grows in practice, so a real shrink this large never happens.
 */
const minimumKeptShare = 0.8;

/** Rows written per statement. */
const writeBatchSize = 1000;

/** The TMDB titles hinted for one AniList entry. */
export interface TmdbHint {
	showId: number | null;
	movieIds: number[];
}

const TmdbIdSchema = z.number().int().positive();

/**
 * One entry of the list. Everything but the AniList and TMDB IDs is ignored,
 * so fields the generator adds or drops later do not matter.
 */
const ListEntrySchema = z.object({
	anilist_id: TmdbIdSchema,
	themoviedb_id: z.object({
		movie: z.array(TmdbIdSchema).optional(),
		tv: TmdbIdSchema.optional(),
	}),
});

/** The TMDB titles hinted for an AniList entry, or `null` when there are none. */
export const tmdbHintFor = async (anilistId: number): Promise<TmdbHint | null> => {
	const [row] = await db
		.select({
			movieIds: tmdbHint.movieIds,
			showId: tmdbHint.showId,
		})
		.from(tmdbHint)
		.where(eq(tmdbHint.anilistId, anilistId))
		.limit(1);

	// Bun's driver reads an integer array as an Int32Array, whose `map`
	// would turn each of its IDs into a number again.
	return row
		? {
				movieIds: [...row.movieIds],
				showId: row.showId,
			}
		: null;
};

/**
 * Reads the list's hints by AniList ID.
 *
 * Entries without an AniList ID or TMDB IDs, and malformed entries, are
 * skipped. Should two entries name the same AniList ID, the first show wins
 * and the films of both are kept.
 *
 * @throws {TypeError} when `list` is not an array.
 */
export const parseTmdbHints = (list: unknown): Map<number, TmdbHint> => {
	if (!Array.isArray(list)) {
		throw new TypeError("The Fribb/anime-lists list is not an array");
	}

	const hints = new Map<number, TmdbHint>();
	for (const item of list) {
		const parsed = ListEntrySchema.safeParse(item);
		if (!parsed.success) {
			continue;
		}

		const { anilist_id: anilistId, themoviedb_id: ids } = parsed.data;
		const known = hints.get(anilistId);
		const hint = {
			movieIds: [...new Set([...(known?.movieIds ?? []), ...(ids.movie ?? [])])],
			showId: known?.showId ?? ids.tv ?? null,
		};
		if (hint.showId !== null || hint.movieIds.length > 0) {
			hints.set(anilistId, hint);
		}
	}

	return hints;
};

/**
 * Downloads Fribb/anime-lists' merged list, minified. Its generator rebuilds
 * it about weekly from anime-offline-database, which links AniList to AniDB,
 * and the Anime-Lists project, which links AniDB to TMDB.
 */
const downloadHints = async () => {
	const response = await attempt(
		fetch("https://raw.githubusercontent.com/Fribb/anime-lists/master/anime-list-mini.json", {
			signal: AbortSignal.timeout(60_000),
		}),
	);
	if (response.error) {
		throw new UpstreamUnavailableError(
			"GitHub could not be reached for the Fribb/anime-lists list",
			{
				cause: response.error,
				retryAfterMs: null,
			},
		);
	}
	if (!response.data.ok) {
		throw new UpstreamUnavailableError(
			`GitHub answered ${response.data.status} for the Fribb/anime-lists list`,
			{
				retryAfterMs: null,
			},
		);
	}

	const list = await attempt(response.data.json());
	if (list.error) {
		throw new UpstreamUnavailableError("The Fribb/anime-lists list is not JSON", {
			cause: list.error,
			retryAfterMs: null,
		});
	}

	const hints = attempt(() => parseTmdbHints(list.data), TypeError);
	if (hints.error) {
		throw new UpstreamUnavailableError("The Fribb/anime-lists list is malformed", {
			cause: hints.error,
			retryAfterMs: null,
		});
	}
	return hints.data;
};

const sameHint = (left: TmdbHint | undefined, right: TmdbHint) =>
	left !== undefined &&
	left.showId === right.showId &&
	left.movieIds.length === right.movieIds.length &&
	left.movieIds.every((id, index) => id === right.movieIds[index]);

/**
 * Brings the stored hints in line with the current list: new and changed
 * hints are written, and hints the list no longer has are removed.
 *
 * @returns The AniList IDs whose hint changed, removed ones included.
 * @throws {UpstreamUnavailableError} when the list cannot be downloaded
 *   or read, or holds far fewer hints than are stored; the stored hints are
 *   then kept as they are.
 */
export const syncTmdbHints = async (): Promise<number[]> => {
	const fetched = await downloadHints();
	const storedRows = await db.select().from(tmdbHint);
	const stored = new Map(storedRows.map(({ anilistId, ...hint }) => [anilistId, hint]));
	if (fetched.size < stored.size * minimumKeptShare) {
		throw new UpstreamUnavailableError(
			`Fribb/anime-lists lists ${fetched.size} TMDB hints against ${stored.size} stored; keeping the stored ones`,
			{
				retryAfterMs: null,
			},
		);
	}

	const changed = [...fetched].filter(
		([anilistId, hint]) => !sameHint(stored.get(anilistId), hint),
	);
	const removed = [...stored.keys()].filter((anilistId) => !fetched.has(anilistId));

	await db.transaction(async (tx) => {
		await inSequence(chunked(changed, writeBatchSize), async (batch) => {
			await tx
				.insert(tmdbHint)
				.values(
					batch.map(([anilistId, hint]) => ({
						anilistId,
						...hint,
					})),
				)
				.onConflictDoUpdate({
					set: {
						movieIds: sql`excluded.movie_ids`,
						showId: sql`excluded.show_id`,
					},
					target: tmdbHint.anilistId,
				});
		});

		await inSequence(chunked(removed, writeBatchSize), async (batch) => {
			await tx.delete(tmdbHint).where(inArray(tmdbHint.anilistId, batch));
		});
	});

	return [...changed.map(([anilistId]) => anilistId), ...removed];
};
