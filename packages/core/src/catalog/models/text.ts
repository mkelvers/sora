/** Normalizers for AniList's text and date formats. */

/**
 * Removes AniList's HTML markup and everything after the story itself.
 *
 * AniList synopses may contain `<br>`, `<i>`, and HTML entities even with
 * `asHtml: false`, label their parts (`OVA 1:`), and often end with
 * `(Source: Crunchyroll)` or a note on how the release was sold.
 */
export const plain = (value: string) => {
	const namedEntities = new Map<string, string>(
		Object.entries({
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
		}),
	);

	const decode = (entity: string, body: string) => {
		if (body.startsWith("#x") || body.startsWith("#X")) {
			return String.fromCodePoint(Number.parseInt(body.slice(2), 16));
		}

		if (body.startsWith("#")) {
			return String.fromCodePoint(Math.trunc(Number(body.slice(1))));
		}

		return namedEntities.get(body.toLowerCase()) ?? entity;
	};

	return value
		.replaceAll(/<br\s*\/?>/giu, "\n")
		.replaceAll(/<[^>]+>/gu, "")
		.replaceAll(
			/&(?<entity>#\d+|#x[\da-f]+|amp|lt|gt|quot|apos|nbsp|mdash|ndash|hellip|rsquo|lsquo|rdquo|ldquo);/giu,
			decode,
		)
		.replace(/\s*[([]\s*(?:source|written by)\s*:[\s\S]*$/iu, "")
		.replace(/^\s*note\s*:[^\n]*/iu, "")
		.replace(/\s*\b(?:note|\*?(?:this )?includes)\s*:[\s\S]*$/iu, "")
		.replaceAll(/^[^.!?\n]{1,40}:[ \t]*$/gmu, "")
		.replaceAll(/[ \t]+\n/gu, "\n")
		.replaceAll(/\n{3,}/gu, "\n\n")
		.trim();
};

/**
 * The longest a synopsis for an about section runs, in characters: about 90
 * words, the most a one-paragraph synopsis holds before it reads as a summary.
 */
export const aboutLength = 560;

/**
 * A sentence that only names the release or how it relates to another, such
 * as `The second season of Frieren.` or `Sequel to Tokyo Revengers.`
 */
export const placeholder =
	/^(?:the )?(?:(?:(?:first|second|third|fourth|fifth|sixth|final|\d+(?:st|nd|rd|th)) (?:season|part|cour)|(?:season|part|cour) \d+) of|(?:sequel|prequel|continuation|remake|recap|adaptation|spin-?off|side[- ]story|compilation)(?: (?:movie|film|series))? (?:to|of|for))\b[^.!?]*[.!?]?$/iu;

/**
 * A synopsis cut down to its premise: AniList's or TMDB's text as
 * {@link plain}, in one paragraph, with as many of its opening sentences
 * as fit in `length` characters, 320 unless told otherwise. The opening sets up the story; what follows is
 * mostly cast lists and subplots. A first sentence too long on its own is
 * cut at a word. A sentence that only names the release is left out
 * when the text has more to say.
 */
export const synopsis = (value: string, length = 320) => {
	const all: string[] = [];

	for (const part of plain(value)
		.replaceAll(/\s+/gu, " ")
		.split(/(?<=[.!?]["”’)]?)\s+(?=["“‘(]?[A-Z])/u)) {
		const previous = all.at(-1);

		if (previous && /\b[A-Z]\.$/u.test(previous)) {
			all[all.length - 1] = `${previous} ${part}`;
		} else {
			all.push(part);
		}
	}

	const story = all.filter((sentence) => !placeholder.test(sentence));
	let kept = all;

	if (story.length > 0) {
		kept = story;
	}

	const [first = "", ...rest] = kept;

	if (first.length > length) {
		let cut = length - 1;
		const word = first.lastIndexOf(" ", length - 1);

		if (word > 0) {
			cut = word;
		}

		return `${first.slice(0, cut).trimEnd()}…`;
	}

	let summary = first;

	for (const sentence of rest) {
		if (summary.length + 1 + sentence.length > length) {
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

	if (date.day) {
		return `${month}-${String(date.day).padStart(2, "0")}`;
	}

	return month;
};

export const fromUnixSeconds = (seconds: number) => new Date(seconds * 1000).toISOString();
