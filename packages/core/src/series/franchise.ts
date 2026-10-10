import type { AnimeFormat } from "../catalog/models/anime";
import type { FranchisePart } from "../models/series";

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

/** Formats that can establish the default TV/web adaptation. */
const seasonFormats = new Set<AnimeFormat>(["TV", "TV_SHORT", "ONA"]);

/** Relationships used to keep adaptations and recaps out of the viewing path. */
export interface FranchiseOptions {
	/** Pairs of titles that adapt the same story. */
	alternatives?: readonly (readonly [number, number])[];
	/** AniList IDs explicitly identified as summaries or compilations. */
	summaries?: readonly number[];
	/** Keep an explicitly selected extra available in the picker. */
	currentId?: number;
}

/**
 * Lists the default adaptation's story entries, then its other related stories.
 * Sequel pairs must point from prequel to sequel. Story entries follow these
 * relationships, with release dates breaking ties; films and specials that
 * continue the story belong alongside TV seasons. An optional non-TV prequel
 * does not displace the first TV season.
 *
 * Alternatives and recaps stay accessible in the catalog but are omitted from
 * related recommendations. When a film and TV arc retell the same story, the
 * TV arc is preferred. An explicitly selected alternative is returned with
 * role `alternative`, so it can be selected without entering recommendations.
 * `next_series_id` is only supplied for an unambiguous, available direct sequel.
 */
export function franchiseParts(
	titles: readonly FranchiseTitle[],
	sequels: readonly (readonly [number, number])[],
	options: FranchiseOptions = {},
): Omit<FranchisePart, "card">[] {
	const byRelease = [...new Map(titles.map((title) => [title.anilistId, title])).values()].toSorted(
		(left, right) => (left.startDate ?? "9999").localeCompare(right.startDate ?? "9999"),
	);
	const isSeriesFormat = (title: FranchiseTitle) =>
		title.format !== null && seasonFormats.has(title.format);
	const first = byRelease.find(isSeriesFormat) ?? byRelease[0];
	const links = [...sequels];
	const component = (id: number) => {
		const ids = new Set([id]);
		for (let frontier = [id]; frontier.length > 0;) {
			const next = new Set<number>();
			for (const [left, right] of links) {
				if (frontier.includes(left) && !ids.has(right)) next.add(right);
				if (frontier.includes(right) && !ids.has(left)) next.add(left);
			}
			frontier = [...next];
			frontier.forEach((id) => ids.add(id));
		}
		return ids;
	};
	const current = byRelease.find((title) => title.anilistId === options.currentId);
	const selected = first;
	const base = (selected?.title ?? "").replace(/\s*\(TV\)$/i, "");
	if (sequels.length > 0 && selected) {
		// AniList often leaves a gap between eras of one show. A series named
		// after the franchise whose own seasons are linked joins the story after
		// the latest earlier one; a lone spin-off, an alternative adaptation, or
		// a recap never does.
		const apart = new Set([...(options.alternatives ?? []).flat(), ...(options.summaries ?? [])]);
		const joined = component(selected.anilistId);
		for (const title of byRelease) {
			if (
				joined.has(title.anilistId) ||
				apart.has(title.anilistId) ||
				!links.some(([left, right]) => left === title.anilistId || right === title.anilistId) ||
				!isSeriesFormat(title) ||
				withoutPrefix(title.title.replace(/\s*\(TV\)$/i, ""), base) === null
			) {
				continue;
			}

			const before = byRelease.findLast(
				(earlier) =>
					joined.has(earlier.anilistId) &&
					isSeriesFormat(earlier) &&
					(earlier.startDate ?? "9999") < (title.startDate ?? "9999"),
			);
			if (before) {
				links.push([before.anilistId, title.anilistId]);
				component(title.anilistId).forEach((id) => joined.add(id));
			}
		}
	}

	const continuity = selected ? component(selected.anilistId) : new Set<number>();
	const omitted = new Set(options.summaries);
	for (const [left, right] of options.alternatives ?? []) {
		const leftTitle = byRelease.find((title) => title.anilistId === left);
		const rightTitle = byRelease.find((title) => title.anilistId === right);
		if (continuity.has(left) && !continuity.has(right)) {
			component(right).forEach((id) => omitted.add(id));
		} else if (continuity.has(right) && !continuity.has(left)) {
			component(left).forEach((id) => omitted.add(id));
		} else if (continuity.has(left) && continuity.has(right) && leftTitle && rightTitle) {
			if (isSeriesFormat(leftTitle) !== isSeriesFormat(rightTitle)) {
				omitted.add(isSeriesFormat(leftTitle) ? right : left);
			}
		}
	}

	// Only forward continuations pull non-TV entries into the season picker.
	const forward = new Set(selected ? [selected.anilistId] : []);
	for (let changed = true; changed;) {
		changed = false;
		for (const [from, to] of links) {
			if (forward.has(from) && !forward.has(to)) {
				forward.add(to);
				changed = true;
			}
		}
	}
	const candidates = byRelease.filter(
		(title) =>
			!omitted.has(title.anilistId) &&
			(links.length > 0
				? continuity.has(title.anilistId) &&
					(isSeriesFormat(title) ||
						(selected && !isSeriesFormat(selected)) ||
						forward.has(title.anilistId))
				: isSeriesFormat(title) && withoutPrefix(title.title, base) !== null),
	);
	const seasons: FranchiseTitle[] = [];
	const pending = [...candidates];
	let cyclic = false;
	while (pending.length) {
		const ready = pending.findIndex(
			(title) =>
				!links.some(
					([from, to]) => to === title.anilistId && pending.some((part) => part.anilistId === from),
				),
		);
		// Malformed cyclic metadata can still be browsed, but never auto-continued.
		if (ready === -1) cyclic = true;
		seasons.push(...pending.splice(ready === -1 ? 0 : ready, 1));
	}
	const others = byRelease.filter(
		(title) => !seasons.includes(title) && !omitted.has(title.anilistId),
	);
	return [
		...seasons,
		...others,
		...(current && omitted.has(current.anilistId) ? [current] : []),
	].map((title) => {
		const following = new Set(
			sequels
				.filter(([from, to]) => from === title.anilistId && !omitted.has(to))
				.map(([, to]) => to),
		);
		const successors = seasons.filter((part) => following.has(part.anilistId));
		const successor = successors.length === 1 ? successors[0] : undefined;
		const next =
			successor && seasons.indexOf(successor) > seasons.indexOf(title) && successor.episodeCount > 0
				? successor.seriesId
				: null;
		return {
			series_id: title.seriesId,
			role: seasons.includes(title)
				? "season"
				: omitted.has(title.anilistId)
					? "alternative"
					: "extra",
			title: shortTitle(title, base, seasons.includes(title)),
			format: title.format,
			episode_count: title.episodeCount,
			next_series_id:
				!cyclic && seasons.includes(title) && following.size === successors.length ? next : null,
		};
	});
}

function shortTitle(title: FranchiseTitle, base: string, isSeason: boolean) {
	// Keep the title's own numbering, including untranslated sequel names.
	const numbered = isSeason
		? title.title.match(/\b(?:Season\s+(\d+)|(\d+)(?:st|nd|rd|th)\s+Season)(?:\s+Part\s+(\d+))?$/i)
		: null;
	if (numbered) {
		return `Season ${numbered[1] ?? numbered[2]}${numbered[3] ? ` Part ${numbered[3]}` : ""}`;
	}
	const rest = withoutPrefix(title.title.replace(/\s*\(TV\)$/i, ""), base);
	if (rest === null) {
		return title.title;
	}

	const named = rest.replace(/^the movie\b[\s:.-]*/i, "").replace(/[\s~-]+$/, "");
	if (/^\d{4}\)?$/.test(named)) {
		return title.title;
	}
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
