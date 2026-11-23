import type { Tag } from "../models/series";

/** An AniList tag category, such as `Theme-Fantasy` or `Cast-Main Cast`. */
export class Category {
	readonly #category: string | null | undefined;

	constructor(category: string | null | undefined) {
		this.#category = category;
	}

	/**
	 * Where the category puts a tag in browsing; `null` for tags not offered,
	 * such as `Technical` ones like CGI, and for tags without a category.
	 */
	get place(): Pick<Tag, "group" | "section"> | null {
		const category = this.#category;

		if (!category) {
			return null;
		}

		if (category === "Demographic") {
			return {
				group: "demographic",
				section: "Demographic",
			};
		}

		const [kind = "", ...rest] = category.split("-");
		const path = rest.join("-");

		const groups = new Map<string, "cast" | "setting" | "theme">([
			["Cast", "cast"],
			["Setting", "setting"],
			["Theme", "theme"],
		]);

		const group = groups.get(kind);

		if (!group || !path) {
			return null;
		}

		// The last part names the most specific heading: `Game-Sport` is Sport.
		// Sci-Fi is one name with a hyphen in it.
		const sciFi = "Sci-Fi";
		let section = path.split("-").at(-1) ?? path;

		if (path === sciFi) {
			section = sciFi;
		} else if (path.startsWith(`${sciFi}-`)) {
			section = path.slice(sciFi.length + 1);
		}

		return {
			group,
			section,
		};
	}
}
