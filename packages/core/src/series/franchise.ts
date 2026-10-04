import type { AnimeFormat } from "../catalog/models/anime";

/** One title of a franchise as a series page lists it; see `Series.franchise`. */
export interface FranchisePart {
	seriesId: string;
	/**
	 * The title without the franchise's name, such as "Season 2", "OAD", or
	 * "Tears of the Azure Sea"; the first season is "Season 1". A title that
	 * does not start with the franchise's name keeps its whole title.
	 */
	title: string;
	format: AnimeFormat | null;
	/** How many of its episodes can be watched. */
	episodeCount: number;
}

/** What {@link franchiseParts} needs to know about each title. */
export interface FranchiseTitle {
	seriesId: string;
	anilistId: number;
	title: string;
	format: AnimeFormat | null;
	/** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`; `null` when unknown. */
	startDate: string | null;
	episodeCount: number;
}

/** The formats that are a franchise's seasons, listed before its films and extras. */
const seasonFormats = new Set<AnimeFormat>(["TV", "TV_SHORT", "ONA"]);

/**
 * A franchise's titles as a series page lists them: its seasons in release
 * order, then everything else in release order, such as its films, OVAs,
 * and spin-offs, each named without the franchise's name (see
 * {@link FranchisePart.title}).
 *
 * The franchise's name is the title of its first TV or web series, or of its
 * first title when it has none. Its seasons are the TV and web series that
 * first one leads to by AniList's sequel and prequel relations, through
 * films and OVAs too; a spin-off, such as The Slime Diaries or Attack on
 * Titan: Junior High, is related otherwise. Without any such relation, the
 * series named after the franchise are its seasons.
 *
 * Names are compared by their letters and digits alone, so "Demon Slayer
 * -Kimetsu no Yaiba- The Movie: Mugen Train" is "Mugen Train" in the
 * franchise "Demon Slayer: Kimetsu no Yaiba".
 *
 * @param sequels - Pairs of AniList IDs related as sequel and prequel, in
 *   either order.
 */
export function franchiseParts(
	titles: readonly FranchiseTitle[],
	sequels: readonly (readonly [number, number])[],
): FranchisePart[] {
	const byRelease = titles.toSorted((left, right) =>
		(left.startDate ?? "9999").localeCompare(right.startDate ?? "9999"),
	);
	const isSeriesFormat = (title: FranchiseTitle) =>
		title.format !== null && seasonFormats.has(title.format);
	const first = byRelease.find(isSeriesFormat) ?? byRelease[0];
	const base = first?.title ?? "";

	const continuity = new Set(first ? [first.anilistId] : []);
	for (let frontier = [...continuity]; frontier.length > 0;) {
		frontier = sequels.flatMap(([left, right]) =>
			[frontier.includes(left) ? right : null, frontier.includes(right) ? left : null].filter(
				(id): id is number => id !== null && !continuity.has(id),
			),
		);
		frontier.forEach((id) => continuity.add(id));
	}

	const seasons = byRelease.filter(
		(title) =>
			isSeriesFormat(title) &&
			(sequels.length > 0
				? continuity.has(title.anilistId)
				: withoutPrefix(title.title, base) !== null),
	);
	const others = byRelease.filter((title) => !seasons.includes(title));

	return [...seasons, ...others].map((title) => ({
		seriesId: title.seriesId,
		title: shortTitle(title, base),
		format: title.format,
		episodeCount: title.episodeCount,
	}));
}

function shortTitle(title: FranchiseTitle, base: string) {
	const rest = withoutPrefix(title.title, base);
	if (rest === null) {
		return title.title;
	}

	const named = rest.replace(/^the movie\b[\s:.-]*/i, "").replace(/[\s~-]+$/, "");
	if (named) {
		return named;
	}

	return title.format && seasonFormats.has(title.format) ? "Season 1" : title.title;
}

/**
 * `title` after `prefix`, matching letters and digits case-insensitively and
 * skipping everything else, with the punctuation and spaces it then starts
 * with removed; `null` when `title` does not start with `prefix`.
 */
function withoutPrefix(title: string, prefix: string) {
	const isWordCharacter = (character: string) => /[\p{L}\p{N}]/u.test(character);
	const wanted = [...prefix.toLowerCase()].filter(isWordCharacter);
	const characters = [...title];
	let index = 0;
	for (const expected of wanted) {
		while (index < characters.length && !isWordCharacter(characters[index]!)) {
			index += 1;
		}

		if (characters[index]?.toLowerCase() !== expected) {
			return null;
		}

		index += 1;
	}

	if (index < characters.length && isWordCharacter(characters[index]!)) {
		return null;
	}

	return characters
		.slice(index)
		.join("")
		.replace(/^[^\p{L}\p{N}]+/u, "");
}
