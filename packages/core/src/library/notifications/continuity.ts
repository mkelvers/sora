import { and, eq, inArray } from "drizzle-orm";

import { db } from "../../database/client";
import { series, seriesRelated } from "../../database/schema/series";

/** The seasons connected to the ones a profile follows, as AniList relates them by sequel and prequel. */
export class Continuity {
	/** How many entries {@link Continuity.series} follows relations through at most. */
	static readonly #limit = 500;

	readonly #followed: ReadonlyMap<number, Date>;
	readonly #excluded: ReadonlySet<number>;
	readonly #neighbours = new Map<number, Set<number>>();
	readonly #seen: Set<number>;

	/**
	 * @param followed - The AniList ID of each saved or played series and when it was followed.
	 * @param excluded - AniList IDs not to notify about, such as those the profile dropped.
	 */
	constructor(followed: ReadonlyMap<number, Date>, excluded: ReadonlySet<number>) {
		this.#followed = followed;
		this.#excluded = excluded;
		this.#seen = new Set(followed.keys());
	}

	/**
	 * Finds the series a profile follows, including connected seasons, as
	 * AniList relates them by sequel and prequel. Each uses the earliest
	 * watchlist or recorded playback time in its connected seasons as the
	 * cutoff for new releases.
	 *
	 * Relations are followed through series that are not followed too, so the
	 * second sequel of a followed series is found while the first one is not
	 * stored. Entries in `excluded` are left out, even when they were watched.

	 */
	async series(): Promise<Map<number, Date>> {
		await this.#follow([...this.#seen]);

		const followedFrom = new Map<number, Date>();

		for (const [origin, addedAt] of this.#followed) {
			const reached = new Set([origin]);
			const pending = [origin];

			for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
				for (const next of this.#neighbours.get(id) ?? []) {
					if (!reached.has(next)) {
						reached.add(next);
						pending.push(next);
					}
				}
			}

			for (const id of reached) {
				const earlier = followedFrom.get(id);

				const earliest = !this.#excluded.has(id) && (!earlier || addedAt < earlier);

				if (earliest) {
					followedFrom.set(id, addedAt);
				}
			}
		}

		return followedFrom;
	}

	#link(from: number, to: number) {
		this.#neighbours.set(from, (this.#neighbours.get(from) ?? new Set()).add(to));
	}

	async #follow(frontier: number[]): Promise<void> {
		if (frontier.length === 0 || this.#seen.size > Continuity.#limit) {
			return;
		}

		const columns = {
			from: series.anilistId,
			to: seriesRelated.anilistId,
		};

		const continues = inArray(seriesRelated.relation, ["SEQUEL", "PREQUEL"]);

		const [outgoing, incoming] = await Promise.all([
			db
				.select(columns)
				.from(series)
				.innerJoin(seriesRelated, eq(seriesRelated.seriesId, series.id))
				.where(and(continues, inArray(series.anilistId, frontier))),
			db
				.select(columns)
				.from(seriesRelated)
				.innerJoin(series, eq(series.id, seriesRelated.seriesId))
				.where(and(continues, inArray(seriesRelated.anilistId, frontier))),
		]);

		const edges = [...outgoing, ...incoming];

		const next: number[] = [];

		for (const edge of edges) {
			this.#link(edge.from, edge.to);
			this.#link(edge.to, edge.from);

			for (const id of [edge.from, edge.to]) {
				if (!this.#seen.has(id)) {
					this.#seen.add(id);
					next.push(id);
				}
			}
		}

		await this.#follow(next);
	}
}
