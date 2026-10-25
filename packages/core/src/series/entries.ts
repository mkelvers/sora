import { hour } from "@sora/shared";

import { loadMediaById } from "../anilist/client";
import { FranchiseEntriesDocument } from "../anilist/graphql.generated";
import type { FranchiseEntryFragment, MediaRelation } from "../anilist/graphql.generated";
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

/** How long a loaded entry is reused, matching the catalog's card freshness. */
const entryLifetimeMs = hour;

/** Bounds {@link recentEntries}; the oldest entries are evicted first. */
const recentEntryLimit = 5000;

/**
 * Entries loaded recently by this process, by AniList ID.
 *
 * Walking a franchise and resolving each entry's prequels request the same
 * entries again and again. AniList responses by ID are not stored, so
 * without this each would cost an AniList request against a limit of 30–90
 * per minute.
 */
const recentEntries = new Map<
	number,
	{
		entry: FranchiseEntry | null;
		loadedAt: number;
	}
>();

const loadFranchiseEntries = loadMediaById({
	document: FranchiseEntriesDocument,
	media: ({ page0, page1, page2, page3, page4 }) =>
		[page0, page1, page2, page3, page4].flatMap((page) => page?.media ?? []),
	pages: 5,
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

const remember = (id: number, entry: FranchiseEntry | null) => {
	recentEntries.delete(id);
	recentEntries.set(id, {
		entry,
		loadedAt: Date.now(),
	});

	// Maps iterate in insertion order, so the first key is the oldest.
	const oldest = recentEntries.keys().next();
	if (recentEntries.size > recentEntryLimit && !oldest.done) {
		recentEntries.delete(oldest.value);
	}
};

/** Whether an entry is served at all: adult media and music videos never are. */
const isServed = (entry: FranchiseEntry) => {
	return !entry.isAdult && entry.format !== "MUSIC";
};

/** Fetches entries and remembers them and their neighbours. */
const fetchAndRemember = async (ids: readonly number[], load: typeof loadFranchiseEntries) => {
	const loaded = await load(ids);
	const asked = new Set(ids);
	for (const id of ids) {
		const media = loaded.get(id);
		if (!media) {
			remember(id, null);
			continue;
		}

		const { neighbours, ...entry } = media;
		remember(id, isServed(entry) ? entry : null);

		// The next step of a walk, and the prequels matching looks up, then
		// need no request of their own.
		for (const edge of neighbours?.edges ?? []) {
			const neighbour = edge?.node;
			if (neighbour?.type === "ANIME" && !asked.has(neighbour.id)) {
				const { type: _type, ...neighbourEntry } = neighbour;
				remember(neighbour.id, isServed(neighbourEntry) ? neighbourEntry : null);
			}
		}
	}
};

/**
 * Loads franchise entries by AniList ID. Each also brings the entries
 * related to it, which are kept for later calls, so walking a franchise
 * costs one request for every two steps.
 *
 * IDs asked for while a request waits its turn share it, up to 250, so the
 * layouts of many titles at once, as a search starts, cost a request or two
 * rather than one each; see {@link loadMediaById}.
 *
 * Unknown, adult, and music-video IDs are left out: music videos are not
 * watchable series, and adult media is never served.
 *
 * @param load - Fetches entries from AniList; tests pass their own.
 */
export const loadEntries = async (
	ids: Iterable<number>,
	load: typeof loadFranchiseEntries = loadFranchiseEntries,
): Promise<Map<number, FranchiseEntry>> => {
	const wanted = [...new Set(ids)];
	const missing = wanted.filter((id) => {
		const recent = recentEntries.get(id);
		return !recent || recent.loadedAt + entryLifetimeMs <= Date.now();
	});
	if (missing.length > 0) {
		await fetchAndRemember(missing, load);
	}

	const entries = new Map<number, FranchiseEntry>();
	for (const id of wanted) {
		const entry = recentEntries.get(id)?.entry;
		if (entry) {
			entries.set(id, entry);
		}
	}

	return entries;
};

/** IDs of the anime the entry is related to by one of `relations`. */
export const idsRelatedBy = (entry: FranchiseEntry, relations: ReadonlySet<MediaRelation>) => {
	return (entry.relations?.edges ?? []).flatMap((edge) =>
		edge?.node?.type === "ANIME" && edge.relationType && relations.has(edge.relationType)
			? [edge.node.id]
			: [],
	);
};

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

	return {
		format:
			entry.format === "MANGA" || entry.format === "NOVEL" || entry.format === "ONE_SHOT"
				? null
				: entry.format,
		titles: [...primaryTitles, ...new Set(synonyms)],
		primaryTitleCount: primaryTitles.length,
		startDate: entry.startDate ? fuzzyDate(entry.startDate) : null,
		endDate: entry.endDate ? fuzzyDate(entry.endDate) : null,
		// Before its first episode airs, an entry's length is unknown, not zero.
		episodes:
			entry.episodes ??
			(entry.nextAiringEpisode && entry.nextAiringEpisode.episode > 1
				? entry.nextAiringEpisode.episode - 1
				: null),
		airsFrom: entry.status === "NOT_YET_RELEASED" ? now.toISOString().slice(0, 10) : null,
		durationMinutes: entry.duration,
	};
};
