import type { ContinueWatching, SeriesCard, WatchlistStatus } from "@sora/sdk";
import { createContext } from "svelte";

import { getContinueWatching } from "./(home)/home.remote";
import { getWatchlist, setWatchlistStatus } from "./watchlist/watchlist.remote";

export const statuses = [
	{
		value: "watching",
		label: "Watching",
		empty: {
			title: "Nothing on the go right now.",
			hint: "Finish an episode of a title on your Watchlist and it lands here.",
		},
	},
	{
		value: "plan_to_watch",
		label: "Plan to watch",
		empty: {
			title: "Nothing planned to watch.",
			hint: "Add a few titles you've been meaning to start.",
		},
	},
	{
		value: "completed",
		label: "Completed",
		empty: {
			title: "Nothing finished yet.",
			hint: "Titles you watch to the end land here.",
		},
	},
	{
		value: "dropped",
		label: "Dropped",
		empty: {
			title: "Nothing dropped. Everything's still in the running.",
			hint: "Titles you give up on land here, out of your way.",
		},
	},
] as const satisfies readonly {
	value: WatchlistStatus;
	label: string;
	empty: {
		title: string;
		hint: string;
	};
}[];

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

	toggle(series: SeriesCard) {
		this.set(series, this.status.has(series.id) ? null : "plan_to_watch");
	}

	set(series: SeriesCard, status: WatchlistStatus | null) {
		const now = new Date().toISOString();

		setWatchlistStatus({
			seriesId: series.id,
			status,
		}).updates(
			getWatchlist().withOverride((current) => {
				const rest = current.filter((entry) => entry.series.id !== series.id);
				if (!status) {
					return rest;
				}

				return [
					{
						series,
						status,
						added_at: current.find((entry) => entry.series.id === series.id)?.added_at ?? now,
						updated_at: now,
					},
					...rest,
				];
			}),
		);
	}
}

export const [getLibrary, setLibrary] = createContext<Library>();
