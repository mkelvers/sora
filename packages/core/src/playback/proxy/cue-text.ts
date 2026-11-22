/** The text of a WebVTT cue that a provider converted from ASS without translating it. */
export class CueText {
	/** ASS override blocks, such as `{\an8}` or `{\i1}`. */
	static readonly #override = /\{\\[^}]*\}/gu;

	/** Spaces at the start or end of a line, hard spaces included. */
	static readonly #edgeSpace = /^[ \t ]+|[ \t ]+$/gmu;

	readonly #text: string;

	constructor(text: string) {
		this.#text = text;
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
}
