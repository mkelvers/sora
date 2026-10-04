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
		alt: "Sora's mascot sitting by a desk calendar, frowning at a blank page she tore off",
		width: 720,
		height: 690,
	},
	emptyNotifications: {
		src: emptyNotifications,
		alt: "Sora's mascot asleep against a big golden bell",
		width: 720,
		height: 703,
	},
	emptySearch: {
		src: emptySearch,
		alt: "Sora's mascot squinting at a poster card next to a tipped-over box",
		width: 720,
		height: 663,
	},
	emptyWatchlist: {
		src: emptyWatchlist,
		alt: "Sora's mascot carrying a stack of poster cards to an empty box",
		width: 720,
		height: 700,
	},
	lost: {
		src: lost,
		alt: "Sora's mascot, lost and confused, holding a map upside down",
		width: 701,
		height: 720,
	},
	preparing: {
		src: preparing,
		alt: "Sora's mascot hurrying along with a wobbling stack of poster cards, one sliding off the top",
		width: 720,
		height: 709,
	},
	search: {
		src: search,
		alt: "Sora's mascot peering through a magnifying glass",
		width: 692,
		height: 720,
	},
} satisfies Record<string, Mascot>;
