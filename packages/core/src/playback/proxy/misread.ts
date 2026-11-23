import { defined } from "@sora/shared";

import { CodePage } from "./code-page";

/**
 * A file with one layer of misreading undone, or as it is when it shows
 * none.
 *
 * A file counts as misread when:
 *
 * - Every letter the code page reads from outside ASCII belongs to a sequence
 *   that decodes as UTF-8, or to one cut off at the end of a line. Text truly
 *   written in the code page's languages, such as Russian, has letters
 *   outside any such sequence, and is left as it is, even where a few of its
 *   characters happen to look like one. Punctuation does not count, since a
 *   misread file can also hold some written correctly.
 * - One damaged Latin accent or another layer of misreading provides enough
 *   evidence on its own. A bare Cyrillic word such as "Её" does not.
 * - Latin text such as "É…" must not become an unrelated phonetic letter.
 * - A file's only evidence must not be accented Latin letters turning into
 *   foreign letters inside words.
 *   Czech "spíš…" happens to contain valid UTF-8 bytes in Windows-1252,
 *   but decoding them would turn the end of the word into a Hangul letter.
 *
 * Cut-off sequences cannot be restored and are left as they are.
 */
export class MisreadFile {
	static readonly #latin = /\p{Script=Latin}/u;
	static readonly #foreign = /[^\p{Script=Latin}\P{L}]/u;
	static readonly #marks = /\p{M}/gu;
	static readonly #accent = /^[\u00A0-\u017F]+$/u;
	static readonly #cyrillic = /^\p{Script=Cyrillic}+$/u;
	static readonly #phonetic = /[Ʌ\u0250-\u02AF]/u;

	/** A character UTF-8 writes in three bytes or more, from U+0800 on. */
	static readonly #wideCharacter = /[\u0800-\u{10FFFF}]/u;

	/**
	 * The legacy code pages providers have decoded UTF-8 subtitles with, turning
	 * "—" into "вЂ”" or "â€”".
	 */
	static readonly #codePages = [new CodePage("windows-1251"), new CodePage("windows-1252")];

	readonly #content: string;
	readonly #codePage: CodePage;
	#wide = false;
	#evidence = false;
	#mixed = 0;
	#ambiguous = false;
	#found = 0;

	constructor(content: string, codePage: CodePage) {
		this.#content = content;
		this.#codePage = codePage;
	}

	/**
	 * A subtitle file with its text restored when a provider decoded the UTF-8
	 * file with a legacy code page, as on some of MegaPlay's tracks. A file
	 * misread more than once is restored one layer at a time, each layer judged
	 * on its own, until none is left.
	 */
	static repair(content: string) {
		let repaired = content;
		let layer = MisreadFile.#unwrap(repaired);

		while (layer !== repaired) {
			repaired = layer;
			layer = MisreadFile.#unwrap(repaired);
		}

		return repaired;
	}

	static #unwrap(content: string) {
		for (const codePage of MisreadFile.#codePages) {
			const restored = new MisreadFile(content, codePage).#restore();

			if (restored !== content) {
				return restored;
			}
		}

		return content;
	}

	#restore(): string {
		const decodable = this.#content.replaceAll(this.#codePage.run, (run, offset: number) =>
			this.#inspect(run, offset),
		);

		const leftover = decodable.replaceAll(this.#codePage.cut, "");
		const evidence = this.#evidence || this.#wide || this.#found > 1;
		const mixedWord = this.#mixed > 0 && this.#mixed === this.#found;
		const blocked = mixedWord || this.#ambiguous || this.#codePage.letter.test(leftover);

		if (!evidence || blocked) {
			return this.#content;
		}

		return this.#content.replaceAll(this.#codePage.run, (run) => this.#codePage.decode(run) ?? run);
	}

	#inspect(run: string, offset: number): string {
		const decoded = this.#codePage.decode(run);

		if (decoded === null) {
			return run;
		}

		const before = this.#content.charAt(offset - 1);
		const after = this.#content.charAt(offset + run.length);
		const latinWord = MisreadFile.#latin.test(before) || MisreadFile.#latin.test(after);
		const foreignLetter = MisreadFile.#foreign.test(decoded);
		const latinSource = !MisreadFile.#foreign.test(run);
		const accents = run.normalize("NFD").match(MisreadFile.#marks) ?? [];
		const isolatedLetter = [...decoded].length === 1 && accents.length > 1;

		const mixedWord = latinSource && latinWord && foreignLetter && isolatedLetter;

		if (mixedWord) {
			this.#mixed += 1;
		}

		const phoneticLetter = MisreadFile.#phonetic.test(decoded);
		const layered = decoded.match(this.#codePage.run) !== null;
		this.#evidence ||= this.#accented(run, decoded, latinWord);
		this.#evidence ||= layered;
		this.#ambiguous ||= latinSource && phoneticLetter && !layered;
		this.#wide ||= MisreadFile.#wideCharacter.test(decoded);
		this.#found += 1;

		return "";
	}

	#accented(run: string, decoded: string, latinWord: boolean): boolean {
		const lead = this.#codePage.bytes.get(defined([...run][0]));
		const latinAccent = MisreadFile.#accent.test(decoded);
		const cyrillicWord = MisreadFile.#cyrillic.test(run) && !latinWord && lead !== 0xc3;

		return latinAccent && !cyrillicWord && lead !== undefined && lead >= 0xc2 && lead <= 0xc5;
	}
}
