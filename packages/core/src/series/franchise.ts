import type { AnimeFormat } from "../catalog/models/anime";
import type { FranchisePart } from "../models/series";
import { Name } from "./name";

/** What {@link Franchise} needs to know about each title. */
export interface FranchiseTitle {
	seriesId: string;
	anilistId: number;
	title: string;
	format: AnimeFormat | null;
	/** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`; `null` when unknown. */
	startDate: string | null;
	episodeCount: number;
}

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
	/** Titles of another story, reached only across a spin-off; they never start this one. */
	apart?: readonly number[];
	/**
	 * Pairs of an original and a title AniList lists as its spin-off. The
	 * spin-off and its sequels are a story of their own and never join the
	 * original's seasons.
	 */
	spinOffs?: readonly (readonly [number, number])[];
	/**
	 * Titles with nothing to watch, such as a film AniKoto does not carry yet.
	 * They still link the titles around them into one story but are never
	 * listed, and `next_series_id` skips over them.
	 */
	unlisted?: readonly number[];
}

type SequelLink = readonly [number, number];

/** Whether `title` is named after `original`, such as Yu-Gi-Oh! Zexal after Yu-Gi-Oh!. */
export const isNamedAfter = (title: string, original: string) =>
	new Name(new Name(title).plain).without(new Name(original).plain) !== null;

/**
 * The titles of a franchise as parts: lists the default adaptation's story entries, then its other related stories.
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
 *
 * A spin-off and its sequels are a story of their own (see
 * `FranchiseOptions.spinOffs`). A short special that continues a season is
 * that season's `special` (see `Franchise.#specials`), not a season of its own;
 * `next_series_id` still leads from the season into it.
 */
export class Franchise {
	/** Formats that can establish the default TV/web adaptation. */
	static readonly #seasonFormats = new Set<AnimeFormat>(["TV", "TV_SHORT", "ONA"]);

	/** Formats of a short sequel that is watched as part of the season before it. */
	static readonly #specialFormats = new Set<AnimeFormat>(["SPECIAL", "OVA"]);

	readonly #sequels: readonly SequelLink[];
	readonly #options: FranchiseOptions;
	readonly #byRelease: FranchiseTitle[];
	readonly #links: SequelLink[];
	readonly #selected: FranchiseTitle | undefined;

	/** @param sequels - Pairs pointing from prequel to sequel. */
	constructor(
		titles: readonly FranchiseTitle[],
		sequels: readonly SequelLink[],
		options: FranchiseOptions = {},
	) {
		this.#sequels = sequels;
		this.#options = options;

		this.#byRelease = [
			...new Map(titles.map((title) => [title.anilistId, title])).values(),
		].toSorted((left, right) =>
			(left.startDate ?? "9999").localeCompare(right.startDate ?? "9999"),
		);

		const stories = this.#spinOffStories;

		// A spin-off's own page lists the spin-off's seasons, not its original's.
		const ownStory = stories.find(
			(story) => options.currentId !== undefined && story.has(options.currentId),
		);

		this.#selected = this.#startOf(
			this.#byRelease.filter((title) => {
				if (options.unlisted?.includes(title.anilistId)) {
					return false;
				}

				if (ownStory) {
					return ownStory.has(title.anilistId);
				}

				return !options.apart?.includes(title.anilistId);
			}),
		);

		this.#links = [...sequels];
		const selected = this.#selected;

		if (sequels.length > 0 && selected) {
			this.#joinAcrossGaps(
				selected,
				new Set([
					...(options.alternatives ?? []).flat(),
					...(options.summaries ?? []),
					...stories
						.filter((story) => !story.has(selected.anilistId))
						.flatMap((story) => [...story]),
				]),
			);
		}
	}

	static #isSeason(title: FranchiseTitle) {
		return title.format !== null && Franchise.#seasonFormats.has(title.format);
	}

	/** Every title joined to `id` by `links`, in either direction. */
	static #component(links: readonly SequelLink[], id: number) {
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
	}

	/** The title a part is listed as, named after the story `base` when it is one of its seasons. */
	static #shortTitle(title: FranchiseTitle, base: string, isSeason: boolean) {
		const full = title.title.replace(Name.qualifier, "");

		// Keep the title's own numbering, including untranslated sequel names.
		let numbered: RegExpMatchArray | null = null;

		if (isSeason) {
			numbered = full.match(
				/\b(?:Season\s+(?<season>\d+)|(?<ordinal>\d+)(?:st|nd|rd|th)\s+Season)(?:\s+Part\s+(?<part>\d+))?$/iu,
			);
		}

		if (numbered) {
			let part = "";

			if (numbered[3]) {
				part = ` Part ${numbered[3]}`;
			}

			return `Season ${numbered[1] ?? numbered[2]}${part}`;
		}

		const rest = new Name(full).without(base);

		if (rest === null) {
			return title.title;
		}

		const named = rest
			.replace(/^the movie\b[\s:.-]*/iu, "")
			.replace(/[\s~-]+$/u, "")
			// A name wrapped in brackets loses its opening one with the prefix.
			.replace(/^(?<name>[^(]*)\)$/u, "$<name>");

		// A year, or a crossover such as I, Tsushima x Nameless Mouse, is no name on its own.
		if (/^\d{4}\)?$/u.test(named) || /^[x×]\s/iu.test(named)) {
			return title.title;
		}

		if (named) {
			return named;
		}

		if (title.format && Franchise.#seasonFormats.has(title.format)) {
			return "Season 1";
		}

		return title.title;
	}

	/** The parts, the story's seasons first. */
	get parts(): Omit<FranchisePart, "card">[] {
		const options = this.#options;
		const byRelease = this.#byRelease;
		const links = this.#links;
		const selected = this.#selected;
		const current = byRelease.find((title) => title.anilistId === options.currentId);
		const base = new Name(selected?.title ?? "").plain;
		let continuity = new Set<number>();

		if (selected) {
			continuity = Franchise.#component(links, selected.anilistId);
		}

		const omitted = this.#omitted(continuity);

		// Only forward continuations pull non-TV entries into the season picker.
		const forward = this.#forward;
		// A title released after the show it is a prequel of tells a story the show
		// grew out of; it is an extra, never a season ahead of the show.
		const lateOrigins = this.#origins;
		const selectedStart = selected?.startDate ?? "9999";

		const candidates = byRelease.filter((title) => {
			const isLateOrigin =
				lateOrigins.has(title.anilistId) && (title.startDate ?? "9999") > selectedStart;

			if (omitted.has(title.anilistId) || isLateOrigin) {
				return false;
			}

			if (links.length === 0) {
				return Franchise.#isSeason(title) && new Name(title.title).without(base) !== null;
			}

			const continues =
				Franchise.#isSeason(title) ||
				(selected && !Franchise.#isSeason(selected)) ||
				forward.has(title.anilistId);

			return continuity.has(title.anilistId) && continues;
		});

		const { cyclic, seasons } = this.#inStoryOrder(candidates);

		const others = byRelease.filter(
			(title) => !seasons.includes(title) && !omitted.has(title.anilistId),
		);

		const unlisted = new Set(options.unlisted);

		const followers = (id: number, seen: Set<number>): number[] =>
			this.#sequels
				.filter(([from, to]) => from === id && !omitted.has(to))
				.flatMap(([, to]) => {
					if (!unlisted.has(to)) {
						return [to];
					}

					if (seen.has(to)) {
						return [];
					}

					seen.add(to);

					return followers(to, seen);
				});

		const listed = seasons.filter((title) => !unlisted.has(title.anilistId));
		const seasonOfSpecial = this.#specials(listed);
		const storyName = new Name(selected?.title ?? "").story;
		const shown = [...seasons, ...others, ...this.#otherVersions(continuity)];

		if (current && omitted.has(current.anilistId)) {
			shown.push(current);
		}

		return shown
			.values()
			.filter((title) => !unlisted.has(title.anilistId))
			.map((title) => {
				const following = new Set(followers(title.anilistId, new Set()));
				const successors = listed.filter((part) => following.has(part.anilistId));
				let successor: FranchiseTitle | undefined;

				if (successors.length === 1) {
					[successor] = successors;
				}

				let next: string | null = null;

				const leads =
					successor &&
					seasons.indexOf(successor) > seasons.indexOf(title) &&
					successor.episodeCount > 0;

				if (successor && leads) {
					next = successor.seriesId;
				}

				const season = seasonOfSpecial.get(title.anilistId);
				let role: "alternative" | "extra" | "season" | "special" = "extra";

				if (season) {
					role = "special";
				} else if (seasons.includes(title)) {
					role = "season";
				} else if (omitted.has(title.anilistId)) {
					role = "alternative";
				}

				const continues =
					!cyclic && seasons.includes(title) && following.size === successors.length;

				let nextId: string | null = null;

				if (continues) {
					nextId = next;
				}

				return {
					episode_count: title.episodeCount,
					format: title.format,
					next_series_id: nextId,
					role,
					season_id: season?.seriesId ?? null,
					series_id: title.seriesId,
					title: Franchise.#shortTitle(title, storyName, seasons.includes(title)),
				};
			})
			.toArray();
	}

	/**
	 * The stories AniList calls spin-offs: each spin-off with the titles its
	 * sequel links join it to. A spin-off whose sequels lead back to its original
	 * is part of the original's story, not one of its own.
	 */
	get #spinOffStories() {
		return (this.#options.spinOffs ?? []).flatMap(([original, spinOff]) => {
			const story = Franchise.#component(this.#sequels, spinOff);

			if (story.has(original)) {
				return [];
			}

			return [story];
		});
	}

	/**
	 * The title the franchise starts with among `byRelease`: the first series,
	 * or failing that the first title, that is not a crossover. A crossover
	 * still starts it when that opening title is named after it, as Yu-Gi-Oh!
	 * Zexal is after Yu-Gi-Oh!.
	 */
	#startOf(byRelease: readonly FranchiseTitle[]) {
		const { crossovers } = this.#options;
		const own = byRelease.filter((title) => !crossovers?.includes(title.anilistId));
		let starters = byRelease;

		if (own.length > 0) {
			starters = own;
		}

		const opening = starters.find((title) => Franchise.#isSeason(title)) ?? starters[0];

		if (!opening) {
			return opening;
		}

		const namedAfter = byRelease.find(
			(title) =>
				title !== opening &&
				(Franchise.#isSeason(title) || !Franchise.#isSeason(opening)) &&
				crossovers?.includes(title.anilistId) &&
				isNamedAfter(opening.title, title.title),
		);

		return namedAfter ?? opening;
	}

	/**
	 * AniList often leaves a gap between eras of one show. A series named after
	 * the franchise whose own seasons are linked joins the story after the latest
	 * earlier one, by a link added to the links; a lone spin-off, an alternative
	 * adaptation, or a recap never does.
	 */
	#joinAcrossGaps(selected: FranchiseTitle, apart: ReadonlySet<number>) {
		const byRelease = this.#byRelease;
		const links = this.#links;
		const base = new Name(selected.title).plain;
		const joined = Franchise.#component(links, selected.anilistId);

		for (const title of byRelease) {
			const separate =
				joined.has(title.anilistId) ||
				apart.has(title.anilistId) ||
				!links.some(([left, right]) => left === title.anilistId || right === title.anilistId) ||
				!Franchise.#isSeason(title) ||
				new Name(new Name(title.title).plain).without(base) === null;

			if (separate) {
				continue;
			}

			const before = byRelease.findLast(
				(earlier) =>
					joined.has(earlier.anilistId) &&
					Franchise.#isSeason(earlier) &&
					(earlier.startDate ?? "9999") < (title.startDate ?? "9999"),
			);

			if (before) {
				links.push([before.anilistId, title.anilistId]);

				for (const id of Franchise.#component(links, title.anilistId)) {
					joined.add(id);
				}
			}
		}
	}

	/**
	 * The titles left out of the story: summaries, and the side of each pair of
	 * alternatives that is not the story's. Of a pair inside the story, the one
	 * that is not the same kind of title as the other is left out.
	 */
	#omitted(continuity: ReadonlySet<number>) {
		const options = this.#options;
		const omitted = new Set(options.summaries);

		for (const [left, right] of options.alternatives ?? []) {
			const leftTitle = this.#byRelease.find((title) => title.anilistId === left);
			const rightTitle = this.#byRelease.find((title) => title.anilistId === right);

			const differing =
				leftTitle &&
				rightTitle &&
				Franchise.#isSeason(leftTitle) !== Franchise.#isSeason(rightTitle);

			if (continuity.has(left) && !continuity.has(right)) {
				for (const id of Franchise.#component(this.#links, right)) {
					omitted.add(id);
				}
			} else if (continuity.has(right) && !continuity.has(left)) {
				for (const id of Franchise.#component(this.#links, left)) {
					omitted.add(id);
				}
			} else if (continuity.has(left) && differing) {
				let other = left;

				if (Franchise.#isSeason(leftTitle)) {
					other = right;
				}

				omitted.add(other);
			}
		}

		return omitted;
	}

	/**
	 * The title each other version of the story starts with: a remake of it, or
	 * the original it remakes, whose titles are a story apart (see
	 * `FranchiseOptions.apart`). Listed as an `alternative`, so a viewer finds
	 * the other version from this one.
	 */
	#otherVersions(continuity: ReadonlySet<number>) {
		const options = this.#options;
		const apart = new Set(options.apart);
		const unlisted = new Set(options.unlisted);
		const openings = new Set<FranchiseTitle>();

		for (const pair of options.alternatives ?? []) {
			const other = pair.find((id) => !continuity.has(id));

			const isVersion =
				other !== undefined && apart.has(other) && pair.some((id) => continuity.has(id));

			if (!isVersion) {
				continue;
			}

			const story = Franchise.#component(this.#links, other);

			const titles = this.#byRelease.filter(
				(title) => story.has(title.anilistId) && !unlisted.has(title.anilistId),
			);

			const opening = titles.find((title) => Franchise.#isSeason(title)) ?? titles[0];

			if (opening) {
				openings.add(opening);
			}
		}

		return [...openings];
	}

	/** The titles reached from the start by following sequel links forward only. */
	get #forward() {
		const forward = new Set<number>();

		if (this.#selected) {
			forward.add(this.#selected.anilistId);
		}

		for (let changed = true; changed;) {
			changed = false;

			for (const [from, to] of this.#links) {
				if (forward.has(from) && !forward.has(to)) {
					forward.add(to);
					changed = true;
				}
			}
		}

		return forward;
	}

	/** The titles the start is a prequel of, however far back, which tell a story it grew out of. */
	get #origins() {
		const origins = new Set<number>();
		let frontier: number[] = [];

		if (this.#selected) {
			frontier = [this.#selected.anilistId];
		}

		while (frontier.length > 0) {
			const reached = frontier;

			const before = this.#links.flatMap(([from, to]) => {
				if (reached.includes(to)) {
					return [from];
				}

				return [];
			});

			frontier = before.filter((id) => !origins.has(id));

			for (const id of frontier) {
				origins.add(id);
			}
		}

		return origins;
	}

	/**
	 * `candidates` with each after the titles it is a sequel of, in the order
	 * given otherwise. Malformed cyclic metadata can still be browsed, but is
	 * reported as `cyclic` so it is never auto-continued.
	 */
	#inStoryOrder(candidates: readonly FranchiseTitle[]) {
		const seasons: FranchiseTitle[] = [];
		const pending = [...candidates];
		let cyclic = false;

		while (pending.length) {
			const ready = pending.findIndex(
				(title) =>
					!this.#links.some(
						([from, to]) =>
							to === title.anilistId && pending.some((part) => part.anilistId === from),
					),
			);

			let taken = ready;

			if (ready === -1) {
				cyclic = true;
				taken = 0;
			}

			seasons.push(...pending.splice(taken, 1));
		}

		return {
			cyclic,
			seasons,
		};
	}

	/**
	 * The season each short special on the story path belongs to, by AniList ID:
	 * a special or OVA of at most two episodes whose only prequel on the path is
	 * a series season, or another such special. The finale specials My Hero
	 * Academia More and I am a hero too belong to its final season.
	 */
	#specials(seasons: readonly FranchiseTitle[]) {
		/** The most episodes a special that belongs to the season before it has. */
		const specialEpisodeLimit = 2;

		const seasonOf = new Map<number, FranchiseTitle>();

		for (const title of seasons) {
			if (title.format === null || !Franchise.#specialFormats.has(title.format)) {
				continue;
			}

			if (title.episodeCount > specialEpisodeLimit) {
				continue;
			}

			const prequels = seasons.filter((season) =>
				this.#links.some(([from, to]) => from === season.anilistId && to === title.anilistId),
			);

			const [prequel] = prequels;

			if (prequels.length !== 1 || !prequel) {
				continue;
			}

			let season = seasonOf.get(prequel.anilistId);

			if (Franchise.#isSeason(prequel)) {
				season = prequel;
			}

			if (season) {
				seasonOf.set(title.anilistId, season);
			}
		}

		return seasonOf;
	}
}
