import type { ContinueWatching, WatchlistStatus } from "@sora/sdk";
import { createContext } from "svelte";

import { getContinueWatching } from "./(home)/home.remote";
import { getWatchlist } from "./watchlist/watchlist.remote";

/**
 * The viewer's watchlist and continue-watching rows, indexed by series id once
 * for the whole app so each poster or button looks up its own series instead of
 * scanning the lists.
 */
export class Library {
	status: Map<string, WatchlistStatus>;
	resume: Map<string, ContinueWatching>;

	constructor() {
		const watchlist = getWatchlist();
		const continuing = getContinueWatching();
		this.status = $derived(
			new Map((watchlist.current ?? []).map((entry) => [entry.series.id, entry.status])),
		);
		this.resume = $derived(
			new Map((continuing.current ?? []).map((item) => [item.series.id, item])),
		);
	}
}

export const [getLibrary, setLibrary] = createContext<Library>();
