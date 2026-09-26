import { query } from '$app/server';
import { z } from 'zod';
import { fromSora, profile, sora } from '$lib/server/sora';

export const getSeries = query(z.string(), (id) => fromSora(() => sora.series(id)));

export const getEpisodes = query(
	z.object({
		seriesId: z.string(),
		seasonId: z.string()
	}),
	async (season) => {
		return await sora.episodes(season);
	}
);

/** Where the profile picks the title back up, or null when it has not started it. */
export const getResume = query(z.string(), (seriesId) =>
	fromSora(async () => {
		const account = profile();
		const [item] = await account.sora.continueWatching(account.profileId, {
			params: { series_id: seriesId }
		});
		return item ?? null;
	})
);

/** The profile's saved position in every episode of the title it has played. */
export const getProgress = query(z.string(), (seriesId) =>
	fromSora(() => {
		const account = profile();
		return account.sora.progress(account.profileId, seriesId);
	})
);
