import emptyCalendar from "$lib/assets/illustrations/empty-calendar.webp";
import emptyNotifications from "$lib/assets/illustrations/empty-notifications.webp";
import emptySearch from "$lib/assets/illustrations/empty-search.webp";
import emptyWatchlist from "$lib/assets/illustrations/empty-watchlist.webp";
import lost from "$lib/assets/illustrations/lost.webp";
import preparing from "$lib/assets/illustrations/preparing.webp";
import search from "$lib/assets/illustrations/search.webp";

export interface Mascot {
	src: string;
	alt: string;
	width: number;
	height: number;
}

export const mascots = {
	emptyCalendar: {
		alt: "A little ghost holding a blank desk calendar",
		height: 720,
		src: emptyCalendar,
		width: 720,
	},
	emptyNotifications: {
		alt: "A little ghost asleep against a big bell",
		height: 720,
		src: emptyNotifications,
		width: 720,
	},
	emptySearch: {
		alt: "A sad little ghost looking through a magnifying glass at a card marked with an X",
		height: 720,
		src: emptySearch,
		width: 720,
	},
	emptyWatchlist: {
		alt: "A little ghost peeking into an empty box with two poster cards beside it",
		height: 720,
		src: emptyWatchlist,
		width: 720,
	},
	lost: {
		alt: "A confused little ghost holding a map, with a question mark above it",
		height: 720,
		src: lost,
		width: 720,
	},
	preparing: {
		alt: "A little ghost stacking poster cards",
		height: 720,
		src: preparing,
		width: 720,
	},
	search: {
		alt: "A little ghost peering through a magnifying glass",
		height: 720,
		src: search,
		width: 720,
	},
} satisfies Record<string, Mascot>;
