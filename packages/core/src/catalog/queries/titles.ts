/**
 * The year or format AniList puts in parentheses after a title to tell a
 * remake from the original, as in "Hunter x Hunter (2011)" or "JoJo's
 * Bizarre Adventure (TV)". Nobody types it, so it does not count against a
 * match.
 */
export const disambiguator = /\s*\((?:\d{4}|TV|OVA|ONA|Movie)\)\s*$/iu;

/**
 * A title or query reduced for comparison: lowercase letters and digits, with
 * accents, punctuation, and spacing removed or collapsed, so "Re:ZERO",
 * "re zero", and "Re Zero" compare equal.
 */
export const normalize = (title: string) =>
	title
		.normalize("NFKD")
		.replaceAll(/\p{M}/gu, "")
		.toLowerCase()
		.replaceAll(/[×✕]/gu, " x ")
		.replaceAll(/[^\p{L}\p{N}]+/gu, " ")
		.trim();

/**
 * The text the index matches queries against: every title in
 * {@link normalize}'s form, followed by the initials of each title of
 * two or more words, both with and without a {@link disambiguator}, which
 * `textScore` ignores: "ONE PIECE (Movie)" is found by `op` too.
 */
export const searchText = (titles: readonly (string | null)[]) => {
	const normalized = [
		...new Set(
			titles.flatMap((title) => {
				if (title) {
					return [normalize(title)];
				}

				return [];
			}),
		),
	].filter((title) => title.length > 0);

	const initials = titles.flatMap((title) => {
		if (!title) {
			return [];
		}

		return [title, title.replace(disambiguator, "")].flatMap((spelling) => {
			const words = normalize(spelling).split(" ");

			if (words.length >= 2) {
				return [words.map((word) => word[0]).join("")];
			}

			return [];
		});
	});

	return [...normalized, ...new Set(initials)].join(" | ");
};
