import type { ContinueWatching, SeriesCard, WatchlistStatus } from "@sora/sdk";
import { createContext } from "svelte";

import { getContinueWatching } from "./(home)/home.remote";
import { getProfilePreferences } from "./settings/settings.remote";
import { getEntries, getStatuses, setStatus } from "./watchlist/watchlist.remote";

export const statuses = [
	{
		empty: {
			hint: "Finish an episode of a title on your Watchlist and it lands here.",
			title: "Nothing on the go right now.",
		},
		label: "Watching",
		value: "watching",
	},
	{
		empty: {
			hint: "Add a few titles you've been meaning to start.",
			title: "Nothing planned to watch.",
		},
		label: "Plan to Watch",
		value: "plan_to_watch",
	},
	{
		empty: {
			hint: "Titles you watch to the end land here.",
			title: "Nothing finished yet.",
		},
		label: "Completed",
		value: "completed",
	},
	{
		empty: {
			hint: "Titles you give up on land here, out of your way.",
			title: "Nothing dropped. Everything's still in the running.",
		},
		label: "Dropped",
		value: "dropped",
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
	hideSpoilers: boolean;

	constructor() {
		const watchlist = getStatuses();
		const continuing = getContinueWatching();
		const preferences = getProfilePreferences();
		this.status = $derived(
			new Map((watchlist.current ?? []).map((entry) => [entry.series_id, entry.status])),
		);
		this.resume = $derived(
			new Map((continuing.current ?? []).map((item) => [item.series.id, item])),
		);
		this.hideSpoilers = $derived(preferences.current?.hide_spoilers ?? false);
	}

	toggle(series: SeriesCard) {
		if (this.status.has(series.id)) {
			this.set(series, null);

			return;
		}

		this.set(series, "plan_to_watch");
	}

	set(series: SeriesCard, status: WatchlistStatus | null) {
		if ((this.status.get(series.id) ?? null) === status) {
			return;
		}

		const now = new Date().toISOString();

		setStatus({
			seriesId: series.id,
			status,
		}).updates(
			getStatuses().withOverride((current) => {
				const rest = current.filter((entry) => entry.series_id !== series.id);

				if (status) {
					return [
						{
							series_id: series.id,
							status,
						},
						...rest,
					];
				}

				return rest;
			}),
			getEntries().withOverride((current) => {
				const rest = current.filter((entry) => entry.series.id !== series.id);

				if (!status) {
					return rest;
				}

				return [
					{
						added_at: current.find((entry) => entry.series.id === series.id)?.added_at ?? now,
						series,
						status,
						updated_at: now,
					},
					...rest,
				];
			}),
		);
	}
}

export const [getLibrary, setLibrary] = createContext<Library>();
