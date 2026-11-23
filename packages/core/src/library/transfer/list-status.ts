import type { WatchlistStatus } from "../../models/library";

/** A list status as AniList or MyAnimeList spells it. */
export class ListStatus {
	/**
	 * AniList's list statuses as Sora's four. Paused and rewatching are still
	 * in progress; Sora has no status between watching and dropped.
	 */
	static readonly #anilist = new Map<string, WatchlistStatus>(
		Object.entries({
			COMPLETED: "completed",
			CURRENT: "watching",
			DROPPED: "dropped",
			PAUSED: "watching",
			PLANNING: "plan_to_watch",
			REPEATING: "watching",
		}),
	);

	/** MyAnimeList's statuses, spelled out or as its numbers. */
	static readonly #mal = new Map<string, WatchlistStatus>(
		Object.entries({
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
		}),
	);

	readonly #text: string;

	constructor(text: string) {
		this.#text = text;
	}

	/** Sora's status for this AniList one; `undefined` when Sora has no equivalent. */
	get anilist(): WatchlistStatus | undefined {
		return ListStatus.#anilist.get(this.#text);
	}

	/** Sora's status for this MyAnimeList one; `undefined` when Sora has no equivalent. */
	get mal(): WatchlistStatus | undefined {
		return ListStatus.#mal.get(this.#text.trim().toLowerCase());
	}
}
