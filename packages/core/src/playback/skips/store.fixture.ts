import { day } from "@sora/shared";

/** What is stored for a video with nothing settled, looked at `daysAgo` with `songs` songs. */
export const unsettled = (songs: number, daysAgo: number) => ({
	checkedAt: new Date(Date.now() - daysAgo * day),
	detection: {
		ending: null,
		opening: null,
	},
	songs,
});
