import { sqlConnection } from "../database/client";
import { franchiseRelations } from "./franchise-relations.generated";
import type { IFranchiseRelationsResult } from "./franchise-relations.generated";

/** One stored AniList relation, as one of the two entries it joins sees it (`source`). */
type Relation = IFranchiseRelationsResult;

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
	 * The order relations are taken in within one step: sequels and prequels
	 * first, then by when the entry they lead to started, then by its AniList
	 * ID, so which entries make the limit is the same every time.
	 */
	static #order(left: Relation, right: Relation) {
		const lead = (relation: Relation) => {
			if (relation.source === relation.from) {
				return {
					id: relation.to,
					startDate: relation.toStartDate ?? "9999",
				};
			}

			return {
				id: relation.from,
				startDate: relation.fromStartDate ?? "9999",
			};
		};

		const leftLead = lead(left);
		const rightLead = lead(right);

		return (
			FranchiseWalk.#rank(left.relation) - FranchiseWalk.#rank(right.relation) ||
			leftLead.startDate.localeCompare(rightLead.startDate) ||
			leftLead.id - rightLead.id
		);
	}

	/**
	 * The AniList entries of an entry's franchise, itself left out, the closest
	 * related first.
	 *
	 * A franchise is every entry reached by following AniList's relations (see
	 * `titleRelation`) from series to series, in either direction: a series
	 * stored before its sequel was announced is still found from the sequel.
	 * Only stored series are followed through, so an entry none of them relates
	 * to is not reached. An entry related only as `OTHER` is reached but not
	 * followed through: crossovers, such as Ple Ple Pleiades × Kage-Jitsu!, are
	 * `OTHER` to each franchise they join, and following them would merge the
	 * franchises. A one-off special that lists another as `OTHER` while the other
	 * lists it as something else, such as `PARENT`, is a crossover and counts as
	 * `OTHER` from both; a title in a sequel chain listing `OTHER` does not.
	 *
	 * The walk goes one step of relations at a time, so a closer entry is always
	 * reached first. Sequels and prequels are always followed, so a long-running
	 * franchise's main path is never cut short by the entries around it; those
	 * are reached up to a limit, in the order {@link FranchiseWalk.#order} gives.
	 *
	 * A spin-off, such as My Hero Academia: Vigilantes, is a story of its own:
	 * an entry AniList lists as `SPIN_OFF` of another is reached from it, and it
	 * from the spin-off, but neither is followed through. The spin-off's sequels
	 * belong to its own franchise, and the original's seasons to the original's.
	 * A remake and its original are kept apart the same way: two TV or web
	 * series of two TMDB shows that AniList lists as alternatives, such as
	 * Ranma ½ (2024) and Ranma ½ (1989). A film retelling a TV arc, an OVA with
	 * another ending, and a recap stay with the show they belong to.
	 *
	 * `crossovers` holds the entries reached only as `OTHER`: they share a
	 * universe with the entry but are not part of its story, so they never decide
	 * where the franchise starts. `apart` holds the entries reached only across a
	 * spin-off or from a remake to its original or back, which never start it
	 * either.
	 *
	 * Every relation is read in one query (`franchise-relations.sql`), which
	 * follows the same relations this walk does but without its limit.
	 *
	 * @throws {Error} when the walk would follow an entry the query did not, so
	 * the two disagree on which relations are followed.
	 */
	async reach(): Promise<{
		ids: number[];
		crossovers: Set<number>;
		apart: Set<number>;
	}> {
		/** How many entries beyond the sequel chain {@link FranchiseWalk.reach} reaches at most. */
		const franchiseLimit = 60;

		const anilistId = this.#anilistId;

		const rows = await franchiseRelations.run(
			{
				start: anilistId,
			},
			sqlConnection,
		);

		const relationsOf = Map.groupBy(rows, (row) => row.source);
		const reached = new Set([anilistId]);
		const outsiders = new Set<number>();
		/** Entries reached only from another story, not followed through yet. */
		const held = new Set<number>();
		let around = 0;
		let frontier = [anilistId];

		while (frontier.length > 0) {
			const followed = [...new Set(frontier)];
			const unread = followed.find((id) => id !== anilistId && !relationsOf.has(id));

			if (unread !== undefined) {
				throw new Error(
					`The franchise of AniList ${anilistId} reaches ${unread}, whose relations franchise-relations.sql did not read`,
				);
			}

			const rawEdges = followed
				.flatMap((id) => relationsOf.get(id) ?? [])
				.filter(({ from, to }) => !FranchiseWalk.#isUnrelated(from, to));

			const crossovers = new Set(
				rawEdges
					.values()
					.filter(({ relation, fromChained }) => relation === "OTHER" && !fromChained)
					.map(({ from, to }) => `${to}>${from}`)
					.toArray(),
			);

			const edges = rawEdges.map((rawEdge) => {
				if (crossovers.has(`${rawEdge.from}>${rawEdge.to}`)) {
					return {
						...rawEdge,
						relation: "OTHER",
					};
				}

				return rawEdge;
			});

			// The edges between two stories: a spin-off and its original, a remake and its original.
			const separating = new Set(
				rawEdges
					.filter(({ relation, remake }) => relation === "SPIN_OFF" || remake)
					.flatMap(({ from, to }) => [`${from}>${to}`, `${to}>${from}`]),
			);

			const storyIds = new Set(
				rawEdges
					.filter(({ relation }) => relation !== "OTHER")
					.flatMap(({ from, to }) => [from, to]),
			);

			const next: number[] = [];

			for (const edge of edges.toSorted(FranchiseWalk.#order)) {
				const continues = FranchiseWalk.#rank(edge.relation) === 0;
				const acrossStories = separating.has(`${edge.from}>${edge.to}`);

				for (const id of [edge.from, edge.to]) {
					const reachable = !reached.has(id) && (continues || around < franchiseLimit);

					if (reachable) {
						reached.add(id);

						if (!continues) {
							around += 1;
						}

						if (acrossStories) {
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

						const continuing = held.has(id) && !acrossStories && edge.relation !== "OTHER";

						if (continuing) {
							held.delete(id);
							next.push(id);
						}
					}
				}
			}

			frontier = next;
		}

		reached.delete(anilistId);

		return {
			apart: held,
			crossovers: outsiders,
			ids: [...reached],
		};
	}
}
