import type { StreamTargetKind } from "./token";

/** One tag line of an HLS playlist, without surrounding whitespace. */
export class Tag {
	static readonly #audioRendition = /^#EXT-X-MEDIA:(?:.*,)?TYPE=AUDIO(?:,.*)?$/u;
	static readonly #language = /[:,]LANGUAGE="(?<language>[^"]*)"/u;
	static readonly #group = /[:,]GROUP-ID="(?<group>[^"]*)"/u;
	static readonly #preset = /(?<lead>[:,])DEFAULT=[^,]*/u;
	static readonly #autoselect = /(?<lead>[:,])AUTOSELECT=[^,]*/u;

	readonly #text: string;

	constructor(text: string) {
		this.#text = text;
	}

	/** What the URI in the tag's `URI` attribute points at; `null` for a tag without one. */
	get uriKind(): StreamTargetKind | null {
		const rendition =
			this.#text.startsWith("#EXT-X-MEDIA:") || this.#text.startsWith("#EXT-X-I-FRAME-STREAM-INF:");

		if (rendition) {
			return "playlist";
		}

		if (this.#text.startsWith("#EXT-X-MAP:")) {
			return "segment";
		}

		const key =
			this.#text.startsWith("#EXT-X-KEY:") || this.#text.startsWith("#EXT-X-SESSION-KEY:");

		if (key) {
			return "key";
		}

		return null;
	}

	/** Whether the tag is an audio rendition. */
	get audio() {
		return Tag.#audioRendition.test(this.#text);
	}

	/** The rendition's `LANGUAGE`, if it names one. */
	get language() {
		return Tag.#language.exec(this.#text)?.groups?.language;
	}

	/** The rendition's `GROUP-ID`; empty when it names none. */
	get group() {
		return Tag.#group.exec(this.#text)?.groups?.group ?? "";
	}

	/** The tag with `DEFAULT` and `AUTOSELECT` set to `value`, each added when missing. */
	marked(value: string) {
		let tag = this.#text;

		for (const [pattern, name] of [
			[Tag.#preset, "DEFAULT"],
			[Tag.#autoselect, "AUTOSELECT"],
		] as const) {
			if (!pattern.test(tag)) {
				tag = `${tag},${name}=${value}`;

				continue;
			}

			tag = tag.replace(pattern, `$<lead>${name}=${value}`);
		}

		return tag;
	}
}
