import path from "node:path";

import { defineRule } from "@oxlint/plugins";

import { Declarations } from "../shared/declarations.ts";
import type { Name } from "../shared/name.ts";

/** Where a file sits, as the words its names shouldn't repeat: its folder and its file name. */
class Place {
	static readonly #generic = new Set([
		"",
		".",
		"app",
		"apps",
		"component",
		"lib",
		"package",
		"route",
		"rule",
		"server",
		"src",
		"test",
		"vendor",
	]);

	readonly #owners: Set<string>;

	constructor(filename: string) {
		const folder = path.basename(path.dirname(filename));
		const [file = ""] = path.basename(filename).split(".");
		const owners = [folder, file].map((owner) => owner.toLowerCase().replace(/s$/u, ""));
		this.#owners = new Set(
			owners.filter((owner) => !Place.#generic.has(owner) && !owner.startsWith("+")),
		);
	}

	/** The word of `name` that its folder or file already says, if it has more words than that one. */
	repeated(name: Name): string | undefined {
		if (name.words.length < 2) {
			return undefined;
		}

		return name.words.find((word) => this.#owners.has(word.replace(/s$/u, "")));
	}
}

/**
 * §6 Values and functions don't repeat their folder or file name. Types and
 * classes keep it, since no owner carries their context where they are used.
 */
export const nameContext = defineRule({
	create: (context) => {
		const place = new Place(context.filename);

		const declarations = new Declarations((node, name) => {
			const repeated = place.repeated(name);

			if (repeated) {
				context.report({
					message: `"${name}" repeats "${repeated}", which its folder or file already says (code-style §6).`,
					node,
				});
			}
		});

		return declarations.visitors(false);
	},
	meta: {
		docs: {
			description: "§6 Values and functions don't repeat their folder or file name.",
		},
	},
});
