import { sql } from "drizzle-orm";

import { anilist } from "../../anilist/client";
import { UserAnimeListDocument } from "../../anilist/graphql.generated";
import type { UserAnimeListQuery } from "../../anilist/graphql.generated";
import { db } from "../../database/client";
import { InvalidInputError } from "../../errors";
import type { WatchlistStatus } from "../../models/library";

/** One title of a list kept elsewhere, as an import needs it. */
export interface ListEntry {
	anilistId: number;
	title: string | null;
	status: WatchlistStatus;
	/** How many episodes were watched from the first; `null` for every episode the title lists. */
	through: number | null;
	/** When the list says the title was added to it; `null` when it does not say. */
	addedAt: Date | null;
	/** When the list says the title last changed; `null` when it does not say. */
	changedAt: Date | null;
}

/** The dates a list keeps for one title; any of them can be missing. */
interface ListDates {
	created?: Date | null;
	started?: Date | null;
	finished?: Date | null;
	updated?: Date | null;
}

/**
 * Which dates a list gives for a title, as Sora keeps them. The title was
 * added when the list created the entry, else when it was started or finished,
 * else when it was last updated. It last changed at the latest of them.
 * `null` for both when the list has no date at all.
 */
export const listDates = (
	dates: ListDates,
): {
	addedAt: Date | null;
	changedAt: Date | null;
} => {
	const known = [dates.created, dates.started, dates.finished, dates.updated].filter(
		(date): date is Date => date instanceof Date && !Number.isNaN(date.getTime()),
	);
	return {
		addedAt: known[0] ?? null,
		changedAt: known.length > 0 ? new Date(Math.max(...known.map((date) => date.getTime()))) : null,
	};
};

/** A moment AniList stores as Unix seconds; `0` is how it says it has none. */
const fromUnixSeconds = (seconds: number | null | undefined): Date | null =>
	seconds ? new Date(seconds * 1000) : null;

const dayPattern = /^(?<year>\d{4})(?:-(?<month>\d{2}))?(?:-(?<day>\d{2}))?/u;

/**
 * A day as AniList or MyAnimeList spell it, which may lack the month or the day
 * (a year alone is a valid date on both). A missing part counts as the first;
 * a year of `0000` is MyAnimeList's way of saying there is none.
 */
const fromParts = (
	year?: number | null,
	month?: number | null,
	day?: number | null,
): Date | null => (year ? new Date(Date.UTC(year, (month || 1) - 1, day || 1)) : null);

export const fromDayText = (text: string | null | undefined): Date | null => {
	const parts = text ? dayPattern.exec(text.trim())?.groups : undefined;
	return fromParts(Number(parts?.year), Number(parts?.month), Number(parts?.day));
};

/** A time MyAnimeList sends as an ISO 8601 string. */
export const fromTimestamp = (text: string | null | undefined): Date | null => {
	const time = text ? Date.parse(text) : Number.NaN;
	return Number.isNaN(time) ? null : new Date(time);
};

/**
 * AniList's list statuses as Sora's four. Paused and rewatching are still
 * in progress; Sora has no status between watching and dropped.
 */
const aniListStatuses: Record<string, WatchlistStatus> = {
	COMPLETED: "completed",
	CURRENT: "watching",
	DROPPED: "dropped",
	PAUSED: "watching",
	PLANNING: "plan_to_watch",
	REPEATING: "watching",
};

/** MyAnimeList's statuses, spelled out or as its numbers. */
const malStatuses: Record<string, WatchlistStatus> = {
	"1": "watching",
	"2": "completed",
	"3": "watching",
	"4": "dropped",
	"6": "plan_to_watch",
	completed: "completed",
	dropped: "dropped",
	"on hold": "watching",
	"on-hold": "watching",
	on_hold: "watching",
	"plan to watch": "plan_to_watch",
	plan_to_watch: "plan_to_watch",
	watching: "watching",
};

/** The entries of an AniList list collection, leaving out any with a status Sora has no equivalent for. */
export const aniListEntries = (
	collection: UserAnimeListQuery["MediaListCollection"],
): ListEntry[] => {
	const entries: ListEntry[] = [];
	for (const list of collection?.lists ?? []) {
		for (const entry of list?.entries ?? []) {
			const status = entry?.status ? aniListStatuses[entry.status] : undefined;
			if (entry?.media && status) {
				entries.push({
					anilistId: entry.media.id,
					...listDates({
						created: fromUnixSeconds(entry.createdAt),
						finished: fromParts(
							entry.completedAt?.year,
							entry.completedAt?.month,
							entry.completedAt?.day,
						),
						started: fromParts(entry.startedAt?.year, entry.startedAt?.month, entry.startedAt?.day),
						updated: fromUnixSeconds(entry.updatedAt),
					}),
					status,
					through: status === "completed" ? null : (entry.progress ?? 0),
					title: null,
				});
			}
		}
	}

	return entries;
};

/**
 * Reads an AniList user's anime list. Works for a public list, as anyone
 * can see it on AniList.
 *
 * @throws {InvalidInputError} when the user does not exist or the list is private.
 * @throws {UpstreamUnavailableError} when AniList cannot be reached.
 */
export const readAniListUser = async (username: string): Promise<ListEntry[]> => {
	const { MediaListCollection } = await anilist(
		UserAnimeListDocument,
		{
			userName: username,
		},
		{
			maxAgeMs: 0,
		},
	);
	if (!MediaListCollection) {
		throw new InvalidInputError("That AniList user does not exist or keeps their list private.");
	}

	return aniListEntries(MediaListCollection);
};

const animeBlock = /<anime>(?<body>[\s\S]*?)<\/anime>/gu;
const malFields = {
	finished: /<my_finish_date>\s*(?:<!\[CDATA\[)?(?<value>[^<\]]*)/u,
	id: /<series_animedb_id>\s*(?:<!\[CDATA\[)?(?<value>\d+)/u,
	started: /<my_start_date>\s*(?:<!\[CDATA\[)?(?<value>[^<\]]*)/u,
	status: /<my_status>\s*(?:<!\[CDATA\[)?(?<value>[^<\]]+)/u,
	title: /<series_title>\s*(?:<!\[CDATA\[)?(?<value>[^<\]]*)/u,
	watched: /<my_watched_episodes>\s*(?:<!\[CDATA\[)?(?<value>\d+)/u,
};

/** One title of a MyAnimeList export: its MyAnimeList ID, not an AniList one. */
export interface MalEntry {
	malId: number;
	title: string | null;
	status: WatchlistStatus;
	through: number | null;
	addedAt: Date | null;
	changedAt: Date | null;
}

/**
 * A MyAnimeList list entry as Sora keeps it; `null` for a status Sora has no
 * equivalent for. `watched` is how many episodes MyAnimeList says were watched.
 */
export const toMalEntry = (entry: {
	malId: number;
	title: string | null;
	status: string;
	watched: number;
	/** `YYYY-MM-DD`, or less when the person gave less; `0000-00-00` for none. */
	started?: string | null;
	finished?: string | null;
	/** An ISO 8601 time, which only MyAnimeList's API gives. */
	updated?: string | null;
}): MalEntry | null => {
	const status = malStatuses[entry.status.trim().toLowerCase()];
	return status
		? {
				...listDates({
					finished: fromDayText(entry.finished),
					started: fromDayText(entry.started),
					updated: fromTimestamp(entry.updated),
				}),
				malId: entry.malId,
				status,
				through: status === "completed" ? null : entry.watched,
				title: entry.title,
			}
		: null;
};

/**
 * Reads the anime of a MyAnimeList `animelist` XML export, the file MyAnimeList
 * makes under Profile, Export. A title with a status Sora does not know is
 * left out.
 */
export const parseMyAnimeListExport = (xml: string): MalEntry[] => {
	const entries: MalEntry[] = [];
	for (const match of xml.matchAll(animeBlock)) {
		const block = match.groups?.body ?? "";
		const value = (field: keyof typeof malFields) => malFields[field].exec(block)?.groups?.value;
		const id = value("id");
		const status = value("status");
		const entry =
			id && status
				? toMalEntry({
						finished: value("finished"),
						malId: Number(id),
						started: value("started"),
						status,
						title: value("title")?.trim() || null,
						watched: Number(value("watched") ?? 0),
					})
				: null;
		if (entry) {
			entries.push(entry);
		}
	}

	return entries;
};

/**
 * Sora's entries for MyAnimeList ones, by the MyAnimeList ID AniList keeps
 * with each title Sora already holds. `unmatched` are the titles Sora holds
 * no MyAnimeList ID for, which it cannot import until it has them.
 */
export const fromMyAnimeList = async (
	entries: readonly MalEntry[],
): Promise<{ matched: ListEntry[]; unmatched: MalEntry[] }> => {
	if (entries.length === 0) {
		return { matched: [], unmatched: [] };
	}

	const ids = [...new Set(entries.map((entry) => String(entry.malId)))];
	const rows = await db.execute<{ anilist_id: number; mal_id: number }>(sql`
		select anilist_id, (media->>'idMal')::int as mal_id
		from anime
		where (media->>'idMal') = any(array[${sql.join(
			ids.map((id) => sql`${id}`),
			sql`, `,
		)}]::text[])
	`);
	const byMal = new Map([...rows].map((row) => [row.mal_id, row.anilist_id]));

	const matched: ListEntry[] = [];
	const unmatched: MalEntry[] = [];
	for (const entry of entries) {
		const anilistId = byMal.get(entry.malId);
		if (anilistId === undefined) {
			unmatched.push(entry);
		} else {
			matched.push({
				addedAt: entry.addedAt,
				anilistId,
				changedAt: entry.changedAt,
				status: entry.status,
				through: entry.through,
				title: entry.title,
			});
		}
	}

	return { matched, unmatched };
};
