import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getSeriesProgress } from "$routes/(app)/series/[id]/series.remote";
import { refreshStatus, refreshTracking } from "$routes/(app)/tracking.server";
import { route, SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error } from "@sveltejs/kit";
import { z } from "zod";

import { resolveWatchPlayback } from "./playback.server";

const EpisodeAddress = z.object({
	episode: z.coerce.number().int().positive(),
	seriesId: z.string(),
});

export const getEpisode = query(EpisodeAddress, async ({ seriesId, episode }) => {
	const { sora } = remoteViewer();

	const found = await attempt(
		Promise.all([
			sora.request(route.getSeries, {
				params: {
					series_id: seriesId,
				},
			}),
			sora.request(route.getEpisode, {
				params: {
					episode,
					series_id: seriesId,
				},
			}),
		]),
		SoraError,
	);

	if (found.error?.status === 404) {
		error(404, "Episode not found");
	}

	if (found.error) {
		throw found.error;
	}

	return {
		episode: found.data[1],
		series: found.data[0],
	};
});

export const getPlayback = query(EpisodeAddress, (address) =>
	resolveWatchPlayback(remoteViewer().sora, address),
);

export const getPlaybackPreferences = query(async () => {
	const { sora, profile } = remoteViewer();

	return await sora.request(route.getPlaybackPreferences, {
		params: {
			profile_id: profile.id,
		},
	});
});

export const getProgress = query(EpisodeAddress, async ({ seriesId, episode }) => {
	const { sora, profile } = remoteViewer();

	const progress = await sora.request(route.getProgress, {
		params: {
			episode,
			profile_id: profile.id,
			series_id: seriesId,
		},
	});

	return { profileId: profile.id, progress };
});

export const saveProgress = command(
	z.object({
		duration_seconds: z.number().int().positive(),
		episode: z.number().int().positive(),
		finished: z.boolean(),
		leaving: z.boolean(),
		position_seconds: z.number().int().nonnegative(),
		profileId: z.string(),
		seriesId: z.string(),
	}),
	async ({ seriesId, episode, leaving, profileId, ...progress }) => {
		const { sora, profile } = remoteViewer();

		if (profileId !== profile.id) {
			error(409, "The active profile has changed");
		}

		await sora.request(route.saveProgress, {
			body: progress,
			params: {
				episode,
				profile_id: profile.id,
				series_id: seriesId,
			},
		});

		if (leaving) {
			await Promise.all([getSeriesProgress(seriesId).refresh(), refreshTracking()]);
		} else if (progress.finished) {
			await refreshStatus();
		}
	},
);

export const savePlaybackPreferences = command(
	route.updatePlaybackPreferences.request.body.content["application/json"].schema,
	async (changes) => {
		const { sora, profile } = remoteViewer();

		getPlaybackPreferences().set(
			await sora.request(route.updatePlaybackPreferences, {
				body: changes,
				params: {
					profile_id: profile.id,
				},
			}),
		);
	},
);
