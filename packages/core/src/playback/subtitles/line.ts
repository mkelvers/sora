import { defined } from "@sora/shared";

import { Stem } from "./stem";

/** One word of a line, as its stem and how much it counts for. */
export interface Token {
	stem: Stem;
	weight: number;
}

/** The words of a line, without sound descriptions, markup, or punctuation, reduced to their stems. */
export class Line {
	static readonly #stopWords = new Set(
		`a an the and or but so if of to in on at by for with from as is are was were be been am do does did
	i you he she it we they me him her us them my your his its our their this that these those there
	oh well just not no yes yeah hey what who how why when where which will would can could shall should
	have has had get got go going gonna then than too very really all some any`.split(/\s+/u),
	);

	readonly tokens: Token[];

	constructor(text: string) {
		const spokenText = text
			.toLowerCase()
			.replaceAll(/<[^>]*>|\{\\[^}]*\}|\[[^\]]*\]|\([^)]*\)|♪[^♪]*♪?/gu, " ")
			.replaceAll(/[’‘]/gu, "'");

		this.tokens = (spokenText.match(/[a-z0-9]+(?:'[a-z]+)*/gu) ?? []).map((word) => {
			const bare = word
				.replace(/'(?:s|d|ll|re|ve|m)$/u, "")
				.replace(/n't$/u, "nt")
				.replaceAll("'", "");

			let weight = 1;

			if (Line.#stopWords.has(bare)) {
				weight = 0.25;
			}

			return {
				stem: new Stem(bare),
				weight,
			};
		});
	}

	/** How much the line's words count for together; little words count for less. */
	get weight() {
		return this.tokens.reduce((sum, token) => sum + token.weight, 0);
	}

	/** The weight of the words the line has in common with `other`. */
	shared(other: Token[]) {
		const free = other.map(() => true);
		let shared = 0;

		for (const token of this.tokens) {
			const match = other.findIndex((each, index) => free[index] && token.stem.same(each.stem));

			if (match !== -1) {
				free[match] = false;
				shared += Math.min(token.weight, defined(other[match]).weight);
			}
		}

		return shared;
	}

	/**
	 * How alike the line and `other` are, 0 to 1: twice the weight of the words
	 * they share over the weight of both. Little words count for less.
	 */
	dice(other: Token[]) {
		const shared = this.shared(other);
		const otherWeight = other.reduce((sum, token) => sum + token.weight, 0);

		return (2 * shared) / (this.weight + otherWeight || 1);
	}

	/** Whether the line has the word `token` is, allowing for a mishearing. */
	has(token: Token) {
		return this.tokens.some((other) => other.stem.same(token.stem));
	}
}
