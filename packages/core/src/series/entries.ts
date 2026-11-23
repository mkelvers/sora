import { hour } from "@sora/shared";

import { loadMedia } from "../anilist/client";
import { FranchiseEntriesDocument } from "../anilist/graphql.generated";
import type { FranchiseEntryFragment, MediaRelation } from "../anilist/graphql.generated";
import { zFranchiseEntriesQuery } from "../anilist/validation.generated";
import { fuzzyDate } from "../catalog/models/text";
import type { MatchSubject } from "./matching";

/** An AniList entry as loaded for laying out its series: what TMDB matching compares, and the entries it is related to. */
export type FranchiseEntry = FranchiseEntryFragment;

/**
 * Relations that stay inside one franchise.
 *
 * `CHARACTER` (crossovers), `ADAPTATION`, and `SOURCE` lead outside it and
 * are never followed.
 */
export const franchiseRelations = new Set<MediaRelation>([
	"SEQUEL",
	"PREQUEL",
	"PARENT",
	"SIDE_STORY",
	"SPIN_OFF",
	"ALTERNATIVE",
	"SUMMARY",
	"COMPILATION",
	"CONTAINS",
	"OTHER",
]);

/**
 * Entries loaded recently by this process, by AniList ID.
 *
 * Walking a franchise and resolving each entry's prequels request the same
 * entries again and again. AniList responses by ID are not stored, so
 * without this each would cost an AniList request against a limit of 30–90
 * per minute.
 */
class Recent {
	/** Bounds the entries kept; the oldest are evicted first. */
	static readonly #limit = 5000;

	readonly #entries = new Map<
		number,
		{
			entry: FranchiseEntry | null;
			loadedAt: number;
		}
	>();

	/** Fetches entries from AniList, up to 250 to a request; see {@link loadMedia}. */
	readonly fetch = loadMedia({
		document: FranchiseEntriesDocument,
		media: ({ page0, page1, page2, page3, page4 }) =>
			[page0, page1, page2, page3, page4].flatMap((page) => page?.media ?? []),
		pages: 5,
		schema: zFranchiseEntriesQuery,
		variables: ([ids0 = [], ids1 = [], ids2 = [], ids3 = [], ids4 = []]) => ({
			ids0,
			ids1,
			ids2,
			ids3,
			ids4,
			with1: ids1.length > 0,
			with2: ids2.length > 0,
			with3: ids3.length > 0,
			with4: ids4.length > 0,
		}),
	});

	/** The entry as last loaded, `null` when it is unknown or not served; `undefined` when it was never loaded. */
	get(id: number) {
		return this.#entries.get(id);
	}

	/** Fetches entries with `load` and remembers them and their neighbours. */
	async fetchAndRemember(ids: readonly number[], load: Recent["fetch"]) {
		const loaded = await load(ids);
		const asked = new Set(ids);

		for (const id of ids) {
			const media = loaded.get(id);

			if (!media) {
				this.#remember(id, null);
				continue;
			}

			const { neighbours, ...entry } = media;
			this.#remember(id, entry);

			// The next step of a walk, and the prequels matching looks up, then
			// need no request of their own.
			for (const edge of neighbours?.edges ?? []) {
				const neighbour = edge?.node;

				if (neighbour?.type === "ANIME" && !asked.has(neighbour.id)) {
					const { type: _type, ...neighbourEntry } = neighbour;
					this.#remember(neighbour.id, neighbourEntry);
				}
			}
		}
	}

	/** Remembers an entry, as `null` unless it is served at all: adult media and music videos never are. */
	#remember(id: number, entry: FranchiseEntry | null) {
		const served = entry !== null && !entry.isAdult && entry.format !== "MUSIC";
		let kept: FranchiseEntry | null = null;

		if (served) {
			kept = entry;
		}

		this.#entries.delete(id);
		this.#entries.set(id, {
			entry: kept,
			loadedAt: Date.now(),
		});

		// Maps iterate in insertion order, so the first key is the oldest.
		const oldest = this.#entries.keys().next();

		if (this.#entries.size > Recent.#limit && !oldest.done) {
			this.#entries.delete(oldest.value);
		}
	}
}

const recent = new Recent();

/**
 * Loads franchise entries by AniList ID. Each also brings the entries
 * related to it, which are kept for later calls, so walking a franchise
 * costs one request for every two steps.
 *
 * IDs asked for while a request waits its turn share it, up to 250, so the
 * layouts of many titles at once, as a search starts, cost a request or two
 * rather than one each; see {@link loadMedia}.
 *
 * Unknown, adult, and music-video IDs are left out: music videos are not
 * watchable series, and adult media is never served.
 *
 * @param load - Fetches entries from AniList; tests pass their own.
 */
export const loadByIds = async (
	ids: Iterable<number>,
	load: Recent["fetch"] = recent.fetch,
): Promise<Map<number, FranchiseEntry>> => {
	/** How long a loaded entry is reused, matching the catalog's card freshness. */
	const entryLifetimeMs = hour;

	const wanted = [...new Set(ids)];

	const missing = wanted.filter((id) => {
		const known = recent.get(id);

		return !known || known.loadedAt + entryLifetimeMs <= Date.now();
	});

	if (missing.length > 0) {
		await recent.fetchAndRemember(missing, load);
	}

	const entries = new Map<number, FranchiseEntry>();

	for (const id of wanted) {
		const entry = recent.get(id)?.entry;

		if (entry) {
			entries.set(id, entry);
		}
	}

	return entries;
};

/** IDs of the anime the entry is related to by one of `relations`. */
export const idsRelatedBy = (entry: FranchiseEntry, relations: ReadonlySet<MediaRelation>) =>
	(entry.relations?.edges ?? []).flatMap((edge) => {
		const node = edge?.node;

		if (node?.type !== "ANIME" || !edge?.relationType) {
			return [];
		}

		if (relations.has(edge.relationType)) {
			return [node.id];
		}

		return [];
	});

/** The entry's distinct English, romaji, and native titles, in that order. */
export const primaryTitlesOf = (entry: FranchiseEntry) => {
	const titles = [entry.title?.english, entry.title?.romaji, entry.title?.native].filter(
		(title): title is string => Boolean(title),
	);

	return [...new Set(titles)];
};

/**
 * Describes an entry in the shape the matching rules compare.
 *
 * @param now - When matching runs, which an entry that has not aired yet cannot have aired before.
 */
export const toMatchSubject = (entry: FranchiseEntry, now: Date): MatchSubject => {
	const primaryTitles = primaryTitlesOf(entry);

	const synonyms = (entry.synonyms ?? []).filter(
		(synonym): synonym is string => Boolean(synonym) && !primaryTitles.includes(synonym ?? ""),
	);

	let airsFrom: string | null = null;

	if (entry.status === "NOT_YET_RELEASED") {
		airsFrom = now.toISOString().slice(0, 10);
	}

	let endDate: string | null = null;

	if (entry.endDate) {
		endDate = fuzzyDate(entry.endDate);
	}

	// Before its first episode airs, an entry's length is unknown, not zero.
	let aired: number | null = null;

	if (entry.nextAiringEpisode && entry.nextAiringEpisode.episode > 1) {
		aired = entry.nextAiringEpisode.episode - 1;
	}

	let format: MatchSubject["format"];

	switch (entry.format) {
		case "MANGA":
		case "NOVEL":
		case "ONE_SHOT": {
			format = null;
			break;
		}

		default: {
			({ format } = entry);
		}
	}

	let startDate: string | null = null;

	if (entry.startDate) {
		startDate = fuzzyDate(entry.startDate);
	}

	return {
		airsFrom,
		durationMinutes: entry.duration,
		endDate,
		episodes: entry.episodes ?? aired,
		format,
		primaryTitleCount: primaryTitles.length,
		startDate,
		titles: [...primaryTitles, ...new Set(synonyms)],
	};
};
