import { attempt, defined } from "@sora/shared";

/**
 * How a legacy code page reads UTF-8, derived from the decoder itself, so no
 * character is listed by hand.
 */
export class CodePage {
	/**
	 * Decodes UTF-8 strictly, and keeps a zero-width no-break space where it
	 * stands instead of dropping it as a byte order mark.
	 */
	static readonly #utf8 = new TextDecoder("utf-8", {
		fatal: true,
		ignoreBOM: true,
	});

	/**
	 * UTF-8 sequences in a row as the code page reads them, each a lead byte
	 * and its continuation bytes, unless the row ends in a cut-off one.
	 */
	readonly run: RegExp;

	/**
	 * Sequences ending in one whose continuation bytes were cut off at the end
	 * of a line, as when a provider shortened a line by bytes, not characters.
	 */
	readonly cut: RegExp;

	/** Any letter the code page reads from a byte outside ASCII, such as Cyrillic in Windows-1251. */
	readonly letter: RegExp;

	/** The byte behind each character the code page reads from outside ASCII. */
	readonly bytes = new Map<string, number>();

	constructor(name: "windows-1251" | "windows-1252") {
		const decoder = new TextDecoder(name);

		const characters = (from: number, to: number) => {
			const range = Uint8Array.from(
				{
					length: to - from + 1,
				},
				(_, offset) => from + offset,
			);

			return decoder.decode(range);
		};

		for (const byte of Uint8Array.from(
			{
				length: 128,
			},
			(_, offset) => 0x80 + offset,
		)) {
			this.bytes.set(decoder.decode(Uint8Array.of(byte)), byte);
		}

		const letters = [...characters(0x80, 0xff)].filter((character) => /\p{L}/u.test(character));

		const continuation = `[${characters(0x80, 0xbf)}]`;
		const twoBytes = `[${characters(0xc2, 0xdf)}]`;
		const threeBytes = `[${characters(0xe0, 0xef)}]`;
		const fourBytes = `[${characters(0xf0, 0xf4)}]`;
		const sequence = `(?:${twoBytes}${continuation}|${threeBytes}${continuation}{2}|${fourBytes}${continuation}{3})`;
		const partial = `(?:${twoBytes}|${threeBytes}${continuation}?|${fourBytes}${continuation}{0,2})`;
		const cut = `${sequence}*${partial}(?=\r?\n|$)`;

		this.cut = new RegExp(cut, "gu");
		this.letter = new RegExp(`[${letters.join("")}]`, "u");
		this.run = new RegExp(`${sequence}+(?!${sequence}|${cut})`, "gu");
	}

	/** The text a run {@link CodePage.run} matched stands for, or `null` when its bytes are not UTF-8. */
	decode(misread: string) {
		const encoded = Uint8Array.from(misread, (character) => defined(this.bytes.get(character)));
		const { data, error } = attempt(() => CodePage.#utf8.decode(encoded), TypeError);

		if (error) {
			return null;
		}

		return data;
	}
}
