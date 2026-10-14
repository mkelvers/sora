import emptyCalendar from "$lib/assets/illustrations/empty-calendar.webp";
import emptyNotifications from "$lib/assets/illustrations/empty-notifications.webp";
import emptySearch from "$lib/assets/illustrations/empty-search.webp";
import emptyWatchlist from "$lib/assets/illustrations/empty-watchlist.webp";
import lost from "$lib/assets/illustrations/lost.webp";
import preparing from "$lib/assets/illustrations/preparing.webp";
import search from "$lib/assets/illustrations/search.webp";

export type Mascot = {
	src: string;
	alt: string;
	width: number;
	height: number;
};

export const mascots = {
	emptyCalendar: {
		src: emptyCalendar,
		alt: "A little ghost holding a blank desk calendar",
		width: 720,
		height: 720,
	},
	emptyNotifications: {
		src: emptyNotifications,
		alt: "A little ghost asleep against a big bell",
		width: 720,
		height: 720,
	},
	emptySearch: {
		src: emptySearch,
		alt: "A sad little ghost looking through a magnifying glass at a card marked with an X",
		width: 720,
		height: 720,
	},
	emptyWatchlist: {
		src: emptyWatchlist,
		alt: "A little ghost peeking into an empty box with two poster cards beside it",
		width: 720,
		height: 720,
	},
	lost: {
		src: lost,
		alt: "A confused little ghost holding a map, with a question mark above it",
		width: 720,
		height: 720,
	},
	preparing: {
		src: preparing,
		alt: "A little ghost stacking poster cards",
		width: 720,
		height: 720,
	},
	search: {
		src: search,
		alt: "A little ghost peering through a magnifying glass",
		width: 720,
		height: 720,
	},
} satisfies Record<string, Mascot>;
