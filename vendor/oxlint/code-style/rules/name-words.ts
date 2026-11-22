import path from "node:path";

import { defineRule } from "@oxlint/plugins";

import { Declarations } from "../shared/declarations.ts";
import type { Name } from "../shared/name.ts";

/** The words a name may not use: abbreviations anywhere, filler as its last word, `handle` as its first. */
class Wording {
	static readonly #abbreviations = new Set([
		"arr",
		"btn",
		"cb",
		"cfg",
		"conf",
		"ctx",
		"err",
		"func",
		"idx",
		"msg",
		"num",
		"obj",
		"req",
		"res",
		"str",
		"tmp",
		"val",
	]);

	static readonly #fillers = new Set([
		"async",
		"base",
		"data",
		"fn",
		"helper",
		"helpers",
		"impl",
		"info",
		"later",
		"list",
		"manager",
		"map",
		"promise",
		"util",
		"utils",
	]);

	readonly #words: string[];

	constructor(name: Name) {
		this.#words = name.words;
	}

	/** The first word that breaks the rule, if any. */
	get banned(): string | undefined {
		const abbreviation = this.#words.find((word) => Wording.#abbreviations.has(word));

		if (abbreviation || this.#words.length < 2) {
			return abbreviation;
		}

		const [first] = this.#words;
		const last = this.#words.at(-1) ?? "";

		if (Wording.#fillers.has(last)) {
			return last;
		}

		if (first === "handle") {
			return first;
		}

		return undefined;
	}
}

/** §6 No abbreviations, filler suffixes, or `handle…` names. */
export const nameWords = defineRule({
	create: (context) => {
		const hooks = path.basename(context.filename).startsWith("hooks.");

		const declarations = new Declarations((node, name) => {
			const { banned } = new Wording(name);
			const framework = hooks && banned === "handle";

			if (banned && !framework) {
				context.report({
					message: `"${name}" uses "${banned}"; name what it is instead (code-style §6).`,
					node,
				});
			}
		});

		return declarations.visitors(true);
	},
	meta: {
		docs: {
			description:
				"§6 No abbreviations, filler suffixes, or handle- names. SvelteKit's hooks files keep the handle names it requires.",
		},
	},
});
