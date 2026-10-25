import { defined } from "@sora/shared";

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
	/** Titles that share the universe without being part of the story; they never start it. */
	crossovers?: readonly number[];
}

const isWordCharacter = (character: string) => /[\p{L}\p{N}]/u.test(character);

/**
 * `title` after `prefix`, matching letters and digits case-insensitively and
 * skipping everything else, with the punctuation and spaces it then starts
 * with removed; `null` when `title` does not start with `prefix`.
 */
const withoutPrefix = (title: string, prefix: string) => {
	const wanted = [...prefix.toLowerCase()].filter(isWordCharacter);
	const characters = [...title];
	let index = 0;
	for (const expected of wanted) {
		while (index < characters.length && !isWordCharacter(defined(characters[index]))) {
			index += 1;
		}

		if (characters[index]?.toLowerCase() !== expected) {
			return null;
		}

		index += 1;
	}

	if (index < characters.length && isWordCharacter(defined(characters[index]))) {
		return null;
	}

	return characters
		.slice(index)
		.join("")
		.replace(/^[^\p{L}\p{N}]+/u, "");
};

const plain = (name: string) => name.replace(/\s*\(TV\)$/iu, "");

/** Whether `title` is named after `original`, such as Yu-Gi-Oh! Zexal after Yu-Gi-Oh!. */
export const isNamedAfter = (title: string, original: string) =>
	withoutPrefix(plain(title), plain(original)) !== null;

const shortTitle = (title: FranchiseTitle, base: string, isSeason: boolean) => {
	// Keep the title's own numbering, including untranslated sequel names.
	const numbered = isSeason
		? title.title.match(
				/\b(?:Season\s+(?<season>\d+)|(?<ordinal>\d+)(?:st|nd|rd|th)\s+Season)(?:\s+Part\s+(?<part>\d+))?$/iu,
			)
		: null;
	if (numbered) {
		return `Season ${numbered[1] ?? numbered[2]}${numbered[3] ? ` Part ${numbered[3]}` : ""}`;
	}
	const rest = withoutPrefix(title.title.replace(/\s*\(TV\)$/iu, ""), base);
	if (rest === null) {
		return title.title;
	}

	const named = rest.replace(/^the movie\b[\s:.-]*/iu, "").replace(/[\s~-]+$/u, "");
	if (/^\d{4}\)?$/u.test(named)) {
		return title.title;
	}
	if (named) {
		return named;
	}

	return title.format && seasonFormats.has(title.format) ? "Season 1" : title.title;
};

type SequelLink = readonly [number, number];

const isSeriesTitle = (title: FranchiseTitle) =>
	title.format !== null && seasonFormats.has(title.format);

const byReleaseDate = (titles: readonly FranchiseTitle[]) =>
	[...new Map(titles.map((title) => [title.anilistId, title])).values()].toSorted((left, right) =>
		(left.startDate ?? "9999").localeCompare(right.startDate ?? "9999"),
	);

/**
 * The title the franchise starts with: the first series, or failing that the
 * first title, that is not a crossover. A crossover still starts it when that
 * opening title is named after it, as Yu-Gi-Oh! Zexal is after Yu-Gi-Oh!.
 */
const startOf = (
	byRelease: readonly FranchiseTitle[],
	crossovers: readonly number[] | undefined,
) => {
	const own = byRelease.filter((title) => !crossovers?.includes(title.anilistId));
	const starters = own.length > 0 ? own : byRelease;
	const opening = starters.find(isSeriesTitle) ?? starters[0];
	return (
		(opening &&
			byRelease.find(
				(title) =>
					title !== opening &&
					(isSeriesTitle(title) || !isSeriesTitle(opening)) &&
					crossovers?.includes(title.anilistId) &&
					isNamedAfter(opening.title, title.title),
			)) ??
		opening
	);
};

/** Every title joined to `id` by sequel links, in either direction. */
const componentOf = (links: readonly SequelLink[], id: number) => {
	const ids = new Set([id]);
	for (let frontier = [id]; frontier.length > 0;) {
		const next = new Set<number>();
		for (const [left, right] of links) {
			if (frontier.includes(left) && !ids.has(right)) {
				next.add(right);
			}
			if (frontier.includes(right) && !ids.has(left)) {
				next.add(left);
			}
		}
		frontier = [...next];
		for (const member of frontier) {
			ids.add(member);
		}
	}
	return ids;
};

/**
 * AniList often leaves a gap between eras of one show. A series named after
 * the franchise whose own seasons are linked joins the story after the latest
 * earlier one, by a link added to `links`; a lone spin-off, an alternative
 * adaptation, or a recap never does.
 */
const joinAcrossGaps = (
	byRelease: readonly FranchiseTitle[],
	links: SequelLink[],
	selected: FranchiseTitle,
	apart: ReadonlySet<number>,
) => {
	const base = plain(selected.title);
	const joined = componentOf(links, selected.anilistId);
	for (const title of byRelease) {
		if (
			joined.has(title.anilistId) ||
			apart.has(title.anilistId) ||
			!links.some(([left, right]) => left === title.anilistId || right === title.anilistId) ||
			!isSeriesTitle(title) ||
			withoutPrefix(plain(title.title), base) === null
		) {
			continue;
		}

		const before = byRelease.findLast(
			(earlier) =>
				joined.has(earlier.anilistId) &&
				isSeriesTitle(earlier) &&
				(earlier.startDate ?? "9999") < (title.startDate ?? "9999"),
		);
		if (before) {
			links.push([before.anilistId, title.anilistId]);
			for (const id of componentOf(links, title.anilistId)) {
				joined.add(id);
			}
		}
	}
};

/**
 * The titles left out of the story: summaries, and the side of each pair of
 * alternatives that is not the story's. Of a pair inside the story, the one
 * that is not the same kind of title as the other is left out.
 */
const omittedFrom = (
	byRelease: readonly FranchiseTitle[],
	links: readonly SequelLink[],
	continuity: ReadonlySet<number>,
	options: FranchiseOptions,
) => {
	const omitted = new Set(options.summaries);
	for (const [left, right] of options.alternatives ?? []) {
		const leftTitle = byRelease.find((title) => title.anilistId === left);
		const rightTitle = byRelease.find((title) => title.anilistId === right);
		if (continuity.has(left) && !continuity.has(right)) {
			for (const id of componentOf(links, right)) {
				omitted.add(id);
			}
		} else if (continuity.has(right) && !continuity.has(left)) {
			for (const id of componentOf(links, left)) {
				omitted.add(id);
			}
		} else if (
			continuity.has(left) &&
			continuity.has(right) &&
			leftTitle &&
			rightTitle &&
			isSeriesTitle(leftTitle) !== isSeriesTitle(rightTitle)
		) {
			omitted.add(isSeriesTitle(leftTitle) ? right : left);
		}
	}
	return omitted;
};

/** The titles reached from the start by following sequel links forward only. */
const forwardFrom = (selected: FranchiseTitle | undefined, links: readonly SequelLink[]) => {
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
	return forward;
};

/** The titles the start is a prequel of, however far back, which tell a story it grew out of. */
const originsOf = (selected: FranchiseTitle | undefined, links: readonly SequelLink[]) => {
	const origins = new Set<number>();
	for (let frontier = selected ? [selected.anilistId] : []; frontier.length > 0;) {
		const before = links.flatMap(([from, to]) => (frontier.includes(to) ? [from] : []));
		frontier = before.filter((id) => !origins.has(id));
		for (const id of frontier) {
			origins.add(id);
		}
	}
	return origins;
};

/**
 * `candidates` with each after the titles it is a sequel of, in the order
 * given otherwise. Malformed cyclic metadata can still be browsed, but is
 * reported as `cyclic` so it is never auto-continued.
 */
const inStoryOrder = (candidates: readonly FranchiseTitle[], links: readonly SequelLink[]) => {
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
		if (ready === -1) {
			cyclic = true;
		}
		seasons.push(...pending.splice(ready === -1 ? 0 : ready, 1));
	}
	return {
		cyclic,
		seasons,
	};
};

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
export const franchiseParts = (
	titles: readonly FranchiseTitle[],
	sequels: readonly SequelLink[],
	options: FranchiseOptions = {},
): Omit<FranchisePart, "card">[] => {
	const byRelease = byReleaseDate(titles);
	const selected = startOf(byRelease, options.crossovers);
	const current = byRelease.find((title) => title.anilistId === options.currentId);
	const base = plain(selected?.title ?? "");
	const links = [...sequels];
	if (sequels.length > 0 && selected) {
		joinAcrossGaps(
			byRelease,
			links,
			selected,
			new Set([...(options.alternatives ?? []).flat(), ...(options.summaries ?? [])]),
		);
	}

	const continuity = selected ? componentOf(links, selected.anilistId) : new Set<number>();
	const omitted = omittedFrom(byRelease, links, continuity, options);

	// Only forward continuations pull non-TV entries into the season picker.
	const forward = forwardFrom(selected, links);
	// A title released after the show it is a prequel of tells a story the show
	// grew out of; it is an extra, never a season ahead of the show.
	const lateOrigins = originsOf(selected, links);
	const selectedStart = selected?.startDate ?? "9999";
	const isLateOrigin = (title: FranchiseTitle) =>
		lateOrigins.has(title.anilistId) && (title.startDate ?? "9999") > selectedStart;
	const candidates = byRelease.filter(
		(title) =>
			!omitted.has(title.anilistId) &&
			!isLateOrigin(title) &&
			(links.length > 0
				? continuity.has(title.anilistId) &&
					(isSeriesTitle(title) ||
						(selected && !isSeriesTitle(selected)) ||
						forward.has(title.anilistId))
				: isSeriesTitle(title) && withoutPrefix(title.title, base) !== null),
	);
	const { cyclic, seasons } = inStoryOrder(candidates, links);
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
		let role: "alternative" | "extra" | "season" = "extra";
		if (seasons.includes(title)) {
			role = "season";
		} else if (omitted.has(title.anilistId)) {
			role = "alternative";
		}
		return {
			episode_count: title.episodeCount,
			format: title.format,
			next_series_id:
				!cyclic && seasons.includes(title) && following.size === successors.length ? next : null,
			role,
			series_id: title.seriesId,
			title: shortTitle(title, base, seasons.includes(title)),
		};
	});
};
