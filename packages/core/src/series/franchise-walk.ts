import { and, eq, inArray } from "drizzle-orm";

import { db } from "../database/client";
import { series, seriesRelated } from "../database/schema/series";

/** The AniList entries of an entry's franchise, found by following stored relations. */
export class FranchiseWalk {
	/**
	 * AniList relations that are wrong, as pairs of AniList IDs: they would chain
	 * two stories that are not one franchise. Followed in neither direction.
	 * The Legend of Hei 2 is listed as the prequel of the Luoxiaohei web series,
	 * which is a separate TMDB title and shares no episodes with the films.
	 */
	static readonly #unrelated: readonly (readonly [number, number])[] = [[166_475, 102_663]];

	readonly #anilistId: number;

	constructor(anilistId: number) {
		this.#anilistId = anilistId;
	}

	static #rank(relation: string) {
		if (relation === "SEQUEL" || relation === "PREQUEL") {
			return 0;
		}

		if (relation === "OTHER") {
			return 2;
		}

		return 1;
	}

	static #isUnrelated(from: number, to: number) {
		return FranchiseWalk.#unrelated.some(
			([left, right]) => (from === left && to === right) || (from === right && to === left),
		);
	}

	/**
	 * The AniList entries of an entry's franchise, itself left out, the closest
	 * related first.
	 *
	 * A franchise is every entry reached by following AniList's relations (see
	 * `seriesRelated`) from series to series, in either direction: a series
	 * stored before its sequel was announced is still found from the sequel.
	 * Only stored series are followed through, so an entry none of them relates
	 * to is not reached. An entry related only as `OTHER` is reached but not
	 * followed through: crossovers, such as Ple Ple Pleiades × Kage-Jitsu!, are
	 * `OTHER` to each franchise they join, and following them would merge the
	 * franchises. A one-off special that lists another as `OTHER` while the other
	 * lists it as something else, such as `PARENT`, is a crossover and counts as
	 * `OTHER` from both; a title in a sequel chain listing `OTHER` does not.
	 *
	 * Sequels and prequels are always followed, so a long-running franchise's
	 * main path is never cut short by the entries around it; those are reached
	 * up to a limit.
	 *
	 * A spin-off, such as My Hero Academia: Vigilantes, is a story of its own:
	 * an entry AniList lists as `SPIN_OFF` of another is reached from it, and it
	 * from the spin-off, but neither is followed through. The spin-off's sequels
	 * belong to its own franchise, and the original's seasons to the original's.
	 *
	 * `crossovers` holds the entries reached only as `OTHER`: they share a
	 * universe with the entry but are not part of its story, so they never decide
	 * where the franchise starts. `apart` holds the entries reached only across a
	 * spin-off, which never start it either.
	 */
	async reach(): Promise<{
		ids: number[];
		crossovers: Set<number>;
		apart: Set<number>;
	}> {
		/** How many entries beyond the sequel chain {@link FranchiseWalk.reach} reaches at most. */
		const franchiseLimit = 60;

		const anilistId = this.#anilistId;
		const reached = new Set([anilistId]);
		const outsiders = new Set<number>();
		/** Entries reached only across a spin-off, not followed through yet. */
		const held = new Set<number>();
		let around = 0;

		const expand = async (frontier: number[]): Promise<void> => {
			if (frontier.length === 0) {
				return;
			}

			const columns = {
				from: series.anilistId,
				relation: seriesRelated.relation,
				to: seriesRelated.anilistId,
			};

			const [outgoing, incoming] = await Promise.all([
				db
					.select(columns)
					.from(series)
					.innerJoin(seriesRelated, eq(seriesRelated.seriesId, series.id))
					.where(inArray(series.anilistId, frontier)),
				db
					.select(columns)
					.from(seriesRelated)
					.innerJoin(series, eq(series.id, seriesRelated.seriesId))
					.where(inArray(seriesRelated.anilistId, frontier)),
			]);

			const rawEdges = [...outgoing, ...incoming].filter(
				({ from, to }) => !FranchiseWalk.#isUnrelated(from, to),
			);

			const listers = [
				...new Set(
					rawEdges
						.values()
						.filter(({ relation }) => relation === "OTHER")
						.map(({ from }) => from)
						.toArray(),
				),
			];

			let chainedRows: {
				anilistId: number;
			}[] = [];

			if (listers.length > 0) {
				chainedRows = await db
					.select({
						anilistId: series.anilistId,
					})
					.from(series)
					.innerJoin(seriesRelated, eq(seriesRelated.seriesId, series.id))
					.where(
						and(
							inArray(series.anilistId, listers),
							inArray(seriesRelated.relation, ["SEQUEL", "PREQUEL"]),
						),
					);
			}

			const chained = new Set(chainedRows.map((row) => row.anilistId));

			const crossovers = new Set(
				rawEdges
					.values()
					.filter(({ relation, from }) => relation === "OTHER" && !chained.has(from))
					.map(({ from, to }) => `${to}>${from}`)
					.toArray(),
			);

			const edges = rawEdges.map((rawEdge) => {
				if (crossovers.has(`${rawEdge.from}>${rawEdge.to}`)) {
					return {
						...rawEdge,
						relation: "OTHER" as const,
					};
				}

				return rawEdge;
			});

			const spinOffs = new Set(
				rawEdges
					.filter(({ relation }) => relation === "SPIN_OFF")
					.flatMap(({ from, to }) => [`${from}>${to}`, `${to}>${from}`]),
			);

			const storyIds = new Set(
				rawEdges
					.filter(({ relation }) => relation !== "OTHER")
					.flatMap(({ from, to }) => [from, to]),
			);

			const next: number[] = [];

			for (const edge of edges.toSorted(
				(left, right) => FranchiseWalk.#rank(left.relation) - FranchiseWalk.#rank(right.relation),
			)) {
				const continues = FranchiseWalk.#rank(edge.relation) === 0;
				const acrossSpinOff = spinOffs.has(`${edge.from}>${edge.to}`);

				for (const id of [edge.from, edge.to]) {
					const reachable = !reached.has(id) && (continues || around < franchiseLimit);

					if (reachable) {
						reached.add(id);

						if (!continues) {
							around += 1;
						}

						if (acrossSpinOff) {
							held.add(id);
						} else if (edge.relation !== "OTHER") {
							next.push(id);
						} else if (!storyIds.has(id)) {
							outsiders.add(id);
						}
					} else {
						if (storyIds.has(id)) {
							outsiders.delete(id);
						}

						const continuing = held.has(id) && !acrossSpinOff && edge.relation !== "OTHER";

						if (continuing) {
							held.delete(id);
							next.push(id);
						}
					}
				}
			}

			await expand(next);
		};

		await expand([anilistId]);

		reached.delete(anilistId);

		return {
			apart: held,
			crossovers: outsiders,
			ids: [...reached],
		};
	}
}
