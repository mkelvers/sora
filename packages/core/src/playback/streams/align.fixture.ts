import { defined } from "@sora/shared";

/** A made-up encode of 300 segments. */
export class Encode {
	readonly #seed: number;

	constructor(seed: number) {
		this.#seed = seed;
	}

	/** Its segment boundaries: irregular, as scene cuts are. */
	get boundaries() {
		const times = [0];
		let state = this.#seed;

		for (let index = 1; index < 300; index += 1) {
			state = (state * 1_103_515_245 + 12_345) % 2 ** 31;
			times.push(defined(times.at(-1)) + 1 + (state % 9000) / 1000);
		}

		return times;
	}
}
