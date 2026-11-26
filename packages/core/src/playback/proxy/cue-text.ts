/** The text of a WebVTT cue that a provider converted from ASS without translating it. */
export class CueText {
	/** ASS override blocks, such as `{\an8}` or `{\i1}`. */
	static readonly #override = /\{\\[^}]*\}/gu;

	/** Spaces at the start or end of a line, hard spaces included. */
	static readonly #edgeSpace = /^[ \t ]+|[ \t ]+$/gmu;

	/** Any markup tag, such as `<i>` or `</b>`. */
	static readonly #markup = /<[^>]*>/gu;

	static readonly #boldTag = /<\/?b>/gu;

	readonly #text: string;

	constructor(text: string) {
		this.#text = text;
	}

	/**
	 * Whether bold marks signs in a track with these cues, as {@link sign}
	 * assumes. Crunchyroll's conversions bold only text shown on screen, so
	 * most of their cues are plain dialogue. A track with next to no plain cue,
	 * as some fan translations are, bolds its dialogue too, and its bold tells
	 * no sign apart.
	 */
	static marksSigns(texts: readonly CueText[]) {
		/** The least share of a track's cues its plain dialogue makes up when bold marks signs. */
		const dialogueShare = 0.1;

		const plain = texts.filter((text) => !text.sign).length;

		return plain >= texts.length * dialogueShare;
	}

	/**
	 * The text with what ASS conversions leave behind turned into plain text:
	 * override blocks removed, `\N` as a line break, `\n` as a space, and `\h` as a
	 * non-breaking space. Hard spaces that only indent a line, which ASS uses to
	 * stagger words across lines, are dropped because cues are centred.
	 */
	get clean() {
		const unescaped = this.#text
			.replaceAll(CueText.#override, "")
			.replaceAll("\\N", "\n")
			.replaceAll("\\n", " ")
			.replaceAll("\\h", "\u00A0");

		return unescaped.replaceAll(CueText.#edgeSpace, "").trim();
	}

	/** The text without markup, which is what a viewer reads. */
	get plain() {
		return this.#text.replaceAll(CueText.#markup, "");
	}

	/** The words of the text, lowercased, without markup or punctuation. */
	get words() {
		return this.plain.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
	}

	/**
	 * Whether the text is bold throughout. Tracks converted from Crunchyroll's
	 * subtitles mark the translation of text shown on screen, such as signs,
	 * titles, and skill names, this way, and dialogue never. Conversions leave
	 * bold unclosed or nested at times, which still counts.
	 */
	get sign() {
		const text = this.#text;

		if (!text.startsWith("<b>")) {
			return false;
		}

		let depth = 0;
		let after = 0;

		for (const tag of text.matchAll(CueText.#boldTag)) {
			const textOutsideBold = depth === 0 && new CueText(text.slice(after, tag.index)).plain.trim();

			if (textOutsideBold) {
				return false;
			}

			if (tag[0] === "<b>") {
				depth += 1;
			} else {
				depth = Math.max(0, depth - 1);
			}

			after = tag.index + tag[0].length;
		}

		return depth > 0 || !new CueText(text.slice(after)).plain.trim();
	}
}
