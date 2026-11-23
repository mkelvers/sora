import { labelToBcp47 } from "anime-sdk";

/** The label MegaPlay gives a subtitle track, such as `Portuguese (- Portuguese(Brazil))`. */
export class Label {
	/** BCP 47 region subtags for the regions MegaPlay names in subtitle labels. */
	static readonly #regions = new Map<string, string>(
		Object.entries({
			brazil: "BR",
			"latin america": "419",
			mexico: "MX",
			portugal: "PT",
			simplified: "Hans",
			spain: "ES",
			traditional: "Hant",
		}),
	);

	readonly #text: string;

	constructor(text: string) {
		this.#text = text;
	}

	/**
	 * The track's BCP 47 tag.
	 *
	 * MegaPlay names regional variants as `Portuguese (- Portuguese(Brazil))`,
	 * which `labelToBcp47` does not know and would cut to `po`. The language part
	 * goes through `labelToBcp47`; a known region is added as its subtag, and an
	 * unknown one is dropped, leaving the plain language. Other notes after the
	 * language, such as `German (German - (Forced))` or `English 2`, are dropped
	 * too.
	 */
	get language() {
		const label = this.#text;

		const regional = /^(?<language>.+?)\s*\(\s*-\s*.*\((?<region>[^()]+)\)\s*\)$/u.exec(
			label.trim(),
		);

		if (!regional?.[1] || !regional[2]) {
			return labelToBcp47(
				label
					.replace(/\s*\(.*$/u, "")
					.replace(/\s+\d+$/u, "")
					.trim(),
			);
		}

		const language = labelToBcp47(regional[1]);
		const region = Label.#regions.get(regional[2].trim().toLowerCase());

		if (region) {
			return `${language}-${region}`;
		}

		return language;
	}
}
