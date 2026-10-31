import { sql } from "drizzle-orm";

import { anilist } from "../../anilist/client";
import { UserAnimeListDocument } from "../../anilist/graphql.generated";
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
}

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
	"plan to watch": "plan_to_watch",
	watching: "watching",
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

	const entries: ListEntry[] = [];
	for (const list of MediaListCollection?.lists ?? []) {
		for (const entry of list?.entries ?? []) {
			const status = entry?.status ? aniListStatuses[entry.status] : undefined;
			if (entry?.media && status) {
				entries.push({
					anilistId: entry.media.id,
					status,
					through: status === "completed" ? null : (entry.progress ?? 0),
					title: null,
				});
			}
		}
	}

	return entries;
};

const animeBlock = /<anime>(?<body>[\s\S]*?)<\/anime>/gu;
const malFields = {
	id: /<series_animedb_id>\s*(?:<!\[CDATA\[)?(?<value>\d+)/u,
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
}

/**
 * Reads the anime of a MyAnimeList `animelist` XML export, the file MyAnimeList
 * makes under Profile, Export. A title with a status Sora does not know is
 * left out.
 */
export const parseMyAnimeListExport = (xml: string): MalEntry[] => {
	const entries: MalEntry[] = [];
	for (const match of xml.matchAll(animeBlock)) {
		const block = match.groups?.body ?? "";
		const id = malFields.id.exec(block)?.groups?.value;
		const rawStatus = malFields.status.exec(block)?.groups?.value?.trim().toLowerCase();
		const status = rawStatus ? malStatuses[rawStatus] : undefined;
		if (!id || !status) {
			continue;
		}

		entries.push({
			malId: Number(id),
			status,
			through:
				status === "completed" ? null : Number(malFields.watched.exec(block)?.groups?.value ?? 0),
			title: malFields.title.exec(block)?.groups?.value?.trim() || null,
		});
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
				anilistId,
				status: entry.status,
				through: entry.through,
				title: entry.title,
			});
		}
	}

	return { matched, unmatched };
};
