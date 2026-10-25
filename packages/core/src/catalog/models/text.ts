/** Normalizers for AniList's text and date formats. */

/**
 * Removes AniList's HTML markup and everything after the story itself.
 *
 * AniList synopses may contain `<br>`, `<i>`, and HTML entities even with
 * `asHtml: false`, label their parts (`OVA 1:`), and often end with
 * `(Source: Crunchyroll)` or a note on how the release was sold.
 */
const namedEntities: Record<string, string> = {
	amp: "&",
	apos: "'",
	gt: ">",
	hellip: "…",
	ldquo: "“",
	lsquo: "‘",
	lt: "<",
	mdash: "—",
	nbsp: " ",
	ndash: "–",
	quot: '"',
	rdquo: "”",
	rsquo: "’",
};
const decodeEntity = (entity: string, body: string) => {
	if (body.startsWith("#x") || body.startsWith("#X")) {
		return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
	}

	if (body.startsWith("#")) {
		return String.fromCodePoint(Math.trunc(Number(body.slice(1))));
	}

	return namedEntities[body.toLowerCase()] ?? entity;
};
export const plainText = (value: string) =>
	value
		.replaceAll(/<br\s*\/?>/giu, "\n")
		.replaceAll(/<[^>]+>/gu, "")
		.replaceAll(
			/&(?<entity>#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|rsquo|lsquo|rdquo|ldquo);/giu,
			decodeEntity,
		)
		.replace(/\s*[([]\s*(?:source|written by)\s*:[\s\S]*$/iu, "")
		.replace(/^\s*note\s*:[^\n]*/iu, "")
		.replace(/\s*\b(?:note|\*?(?:this )?includes)\s*:[\s\S]*$/iu, "")
		.replaceAll(/^[^.!?\n]{1,40}:[ \t]*$/gmu, "")
		.replaceAll(/[ \t]+\n/gu, "\n")
		.replaceAll(/\n{3,}/gu, "\n\n")
		.trim();

/** The longest a {@link synopsis} runs. */
const synopsisLength = 320;

/** Splits text into sentences, keeping an initial such as `J. Smith` in its sentence. */
const sentences = (text: string) => {
	const found: string[] = [];
	for (const part of text.replaceAll(/\s+/gu, " ").split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z])/u)) {
		const previous = found.at(-1);
		if (previous && /\b[A-Z]\.$/u.test(previous)) {
			found[found.length - 1] = `${previous} ${part}`;
		} else {
			found.push(part);
		}
	}

	return found;
};

/** A sentence that only names the release, such as `The second season of Frieren.` */
export const placeholder =
	/^(?:the )?(?:(?:first|second|third|fourth|fifth|sixth|final|\d+(?:st|nd|rd|th)) (?:season|part|cour)|(?:season|part|cour) \d+) of\b[^.!?]*[.!?]?$/iu;

/**
 * A synopsis cut down to its premise: AniList's or TMDB's text as
 * {@link plainText}, with as many of its opening sentences as fit in
 * {@link synopsisLength}. The opening sets up the story; what follows is
 * mostly cast lists and subplots. A first sentence too long on its own is
 * cut at a word. A sentence that only names the release is left out
 * when the text has more to say.
 */
export const synopsis = (value: string) => {
	const all = sentences(plainText(value));
	const story = all.filter((sentence) => !placeholder.test(sentence));
	const [first = "", ...rest] = story.length > 0 ? story : all;
	if (first.length > synopsisLength) {
		const word = first.lastIndexOf(" ", synopsisLength - 1);
		return `${first.slice(0, word > 0 ? word : synopsisLength - 1).trimEnd()}…`;
	}

	let summary = first;
	for (const sentence of rest) {
		if (summary.length + 1 + sentence.length > synopsisLength) {
			break;
		}
		summary = `${summary} ${sentence}`;
	}

	return summary;
};

/** Formats an AniList fuzzy date as the most precise ISO 8601 prefix available. */
export const fuzzyDate = (date: {
	year: number | null;
	month: number | null;
	day: number | null;
}) => {
	if (!date.year) {
		return null;
	}

	const year = String(date.year).padStart(4, "0");
	if (!date.month) {
		return year;
	}

	const month = `${year}-${String(date.month).padStart(2, "0")}`;
	return date.day ? `${month}-${String(date.day).padStart(2, "0")}` : month;
};

export const fromUnixSeconds = (seconds: number) => new Date(seconds * 1000).toISOString();
