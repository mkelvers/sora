import { day, inSequence } from "@sora/shared";
import { eq } from "drizzle-orm";

import { db } from "../database/client";
import { tmdbMapping } from "../database/schema/series";
import { InFlight } from "../in-flight";
import { loadByIds, primaryTitlesOf, toMatchSubject } from "./entries";
import type { FranchiseEntry } from "./entries";
import { playableCount } from "./episodes";
import { tmdbTitles } from "./hints";
import type { TmdbMapping } from "./mapping";
import { Placer } from "./placer";
import type { Predecessor } from "./placer";

/** Resolves where an AniList entry lives on TMDB. */
export class Mapper {
	/** The resolutions running, by AniList ID, which concurrent calls for an entry share. */
	static readonly #inFlight = new InFlight<number, TmdbMapping>();

	readonly #entry: FranchiseEntry;

	constructor(entry: FranchiseEntry) {
		this.#entry = entry;
	}

	/**
	 * Resolves where the entry lives on TMDB, using the stored mapping while
	 * it is still valid.
	 *
	 * The entry's prequel and parent are resolved first, because a sequel is
	 * usually a later season of the show its prequel maps to, and an OVA is
	 * usually a special of its parent's show. Candidate shows and movies come
	 * from those mappings, from the entry's TMDB hint (see `hints.ts`), and from
	 * TMDB title searches; `placeInShow` and `placeAsMovie` decide between
	 * them, so a wrong hint is no more trusted than a search result.
	 * Concurrent calls for the same entry share one resolution.
	 *
	 * @throws {UpstreamUnavailableError} when AniList or TMDB fail.
	 */
	async resolve(): Promise<TmdbMapping> {
		const stored = await this.#fresh();

		if (stored) {
			return stored;
		}

		return Mapper.#inFlight.run(this.#entry.id, () => this.#match(new Set([this.#entry.id])));
	}

	/** The stored mapping, while it is still valid. */
	async #fresh() {
		/**
		 * Airing entries gain episodes, and unmatched entries may appear on TMDB
		 * later, so both are re-checked daily.
		 */
		const volatileLifetimeMs = day;

		/** A finished entry's mapping is reused for a month before being re-verified. */
		const finishedLifetimeMs = 30 * day;

		const entry = this.#entry;

		const [stored] = await db
			.select()
			.from(tmdbMapping)
			.where(eq(tmdbMapping.anilistId, entry.id))
			.limit(1);

		if (!stored) {
			return null;
		}

		let lifetimeMs = volatileLifetimeMs;

		if (stored.tmdbId !== null && entry.status === "FINISHED") {
			lifetimeMs = finishedLifetimeMs;
		}

		if (stored.resolvedAt.getTime() + lifetimeMs > Date.now()) {
			return stored;
		}

		return null;
	}

	async #match(resolving: ReadonlySet<number>): Promise<TmdbMapping> {
		const entry = this.#entry;

		const subject = {
			...toMatchSubject(entry, new Date()),
			playbackEpisodes: await playableCount(entry.id),
		};

		// Synonyms are too noisy to search with.
		const queries = primaryTitlesOf(entry);
		const predecessors = await this.#predecessors(resolving);
		const hint = await tmdbTitles(entry.id);
		const placement = await new Placer(subject, queries, predecessors, hint).best();

		// The columns of a stored mapping for the placement; all empty when the
		// entry was placed nowhere.
		let episodes: Extract<NonNullable<typeof placement>, { mediaType: "tv" }>["episodes"] = [];

		if (placement?.mediaType === "tv") {
			({ episodes } = placement);
		}

		const values = {
			episodeNumber: episodes[0]?.episodeNumber ?? null,
			episodes,
			mediaType: placement?.mediaType ?? null,
			method: placement?.method ?? null,
			resolvedAt: new Date(),
			score: placement?.score ?? null,
			seasonNumber: episodes[0]?.seasonNumber ?? null,
			tmdbId: placement?.tmdbId ?? null,
		};

		const [row] = await db
			.insert(tmdbMapping)
			.values({
				anilistId: entry.id,
				...values,
			})
			.onConflictDoUpdate({
				set: values,
				target: tmdbMapping.anilistId,
			})
			.returning();

		if (!row) {
			throw new Error(`Storing the TMDB mapping for anime ${entry.id} returned no row`);
		}

		return row;
	}

	/**
	 * Resolves the entry's prequels and parents. Entries already being resolved
	 * further up the chain are skipped, which breaks relation cycles.
	 *
	 * Unlike {@link Mapper.resolve}, this never waits on a resolution already in
	 * flight. Two concurrent resolutions whose relations form a cycle (an OVA's
	 * parent listing the OVA as its prequel) would otherwise wait on each other
	 * forever; `resolving` stops the recursion instead.
	 */
	async #predecessors(resolving: ReadonlySet<number>): Promise<Predecessor[]> {
		const edges = (this.#entry.relations?.edges ?? []).flatMap((edge) => {
			const relation = edge?.relationType;
			const node = edge?.node;

			if (node?.type !== "ANIME" || resolving.has(node.id)) {
				return [];
			}

			if (relation === "PREQUEL" || relation === "PARENT") {
				return [
					{
						id: node.id,
						relation,
					},
				];
			}

			return [];
		});

		if (edges.length === 0) {
			return [];
		}

		const entries = await loadByIds(edges.map((edge) => edge.id));

		const predecessors = await inSequence(edges, async (edge): Promise<Predecessor[]> => {
			const predecessor = entries.get(edge.id);

			if (!predecessor) {
				return [];
			}

			const mapper = new Mapper(predecessor);

			return [
				{
					mapping:
						(await mapper.#fresh()) ??
						(await mapper.#match(new Set([...resolving, predecessor.id]))),
					relation: edge.relation,
				},
			];
		});

		return predecessors.flat();
	}
}
