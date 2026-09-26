import { command, query } from '$app/server';
import { error } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
import { fromSora, profile, sora } from '$lib/server/sora';

const Params = z.object({
	seriesId: z.string(),
	seasonId: z.string(),
	episode: z.coerce.number().int().positive()
});

export const getEpisode = query(Params, ({ seriesId, seasonId, episode }) =>
	fromSora(async () => {
		const [series, episodes] = await Promise.all([
			sora.series(seriesId),
			sora.episodes({ seriesId, seasonId })
		]);
		const season = series.seasons.find((season) => season.id === seasonId);
		const found = episodes.find((candidate) => candidate.number === episode);

		if (!season || !found) {
			error(404, 'Episode not found');
		}

		return { series, season, episode: found };
	})
);

export const getPlayback = query(Params, async ({ seasonId, episode }) => {
	try {
		return { media: await sora.playback({ seasonId, number: episode }), problem: null };
	} catch (cause) {
		if (cause instanceof SoraError) {
			return { media: [], problem: cause.message };
		}
		throw cause;
	}
});

/** Where this profile stopped in the episode, in seconds; 0 to start from the top. */
export const getResume = query(Params, ({ seriesId, seasonId, episode }) =>
	fromSora(async () => {
		const account = profile();
		const progress = await account.sora.progress(account.profileId, seriesId);
		const saved = progress.find((entry) => entry.season_id === seasonId && entry.episode === episode);
		// A finished episode plays again from the top.
		return saved && !saved.completed ? saved.position_seconds : 0;
	})
);

export const saveProgress = command(
	Params.omit({ seriesId: true }).extend({
		position: z.number().nonnegative(),
		duration: z.number().positive(),
		at: z.iso.datetime()
	}),
	async ({ seasonId, episode, position, duration, at }) => {
		const account = profile();
		await account.sora.recordProgress(account.profileId, {
			season_id: seasonId,
			episode,
			position_seconds: Math.min(position, duration),
			duration_seconds: duration,
			event_at: new Date(at)
		});
	}
);
