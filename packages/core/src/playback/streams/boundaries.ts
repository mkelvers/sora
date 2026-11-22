import { defined } from "@sora/shared";

/** The segment start times of an encode, ascending. */
export class Boundaries {
	/** How close two segment boundaries must be to count as the same cut. */
	static readonly #tolerance = 0.12;

	readonly #times: number[];

	constructor(times: number[]) {
		this.#times = times;
	}

	/** Whether a boundary of these lies at `time` moved by `offset`. */
	matches(time: number, offset: number) {
		return Math.abs(this.#nearest(time + offset) - (time + offset)) <= Boundaries.#tolerance;
	}

	/**
	 * Offsets from `source`'s boundaries onto these that many boundary pairs
	 * agree on, most agreed first, each refined to the mean of its pairs.
	 */
	offsets(source: number[]) {
		/** The most offsets weighed per boundary; later ones have too few votes to matter. */
		const maximumCandidates = 32;

		/** An offset needs this many matching boundaries across the episode to be considered. */
		const minimumVotes = 4;

		const votes = new Map<number, number>();

		for (const from of source) {
			for (const to of this.#times) {
				const bucket = Math.round((to - from) * 10);
				votes.set(bucket, (votes.get(bucket) ?? 0) + 1);
			}
		}

		const buckets: number[] = [];

		for (const [bucket] of [...votes]
			.filter(([, count]) => count >= minimumVotes)
			.toSorted((a, b) => b[1] - a[1])) {
			if (buckets.length === maximumCandidates) {
				break;
			}

			if (buckets.every((other) => Math.abs(other - bucket) > 3)) {
				buckets.push(bucket);
			}
		}

		return buckets.flatMap((bucket) => {
			const rough = bucket / 10;

			const pairs = source
				.values()
				.map((time) => this.#nearest(time + rough) - time)
				.filter((offset) => Math.abs(offset - rough) <= Boundaries.#tolerance)
				.toArray();

			if (pairs.length > 0) {
				return [pairs.reduce((sum, offset) => sum + offset, 0) / pairs.length];
			}

			return [];
		});
	}

	/** The boundary closest to `time`. */
	#nearest(time: number) {
		const sorted = this.#times;
		let low = 0;
		let high = sorted.length;

		while (low < high) {
			const middle = Math.floor((low + high) / 2);

			if (defined(sorted[middle]) < time) {
				low = middle + 1;
			} else {
				high = middle;
			}
		}

		const before = sorted[low - 1] ?? -Infinity;
		const after = sorted[low] ?? Infinity;

		if (time - before <= after - time) {
			return before;
		}

		return after;
	}
}
