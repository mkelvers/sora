import { command, query } from "$app/server";
import { remoteViewer, sora } from "$lib/server/sora";
import { getWatchlist } from "$lib/watchlist.remote";
import { getContinueWatching } from "$routes/(app)/(home)/home.remote";
import { getSeriesProgress } from "$routes/(app)/series/[id]/series.remote";
import { attempt } from "@sora/attempt";
import { SoraError } from "@sora/sdk";
import { error } from "@sveltejs/kit";
import { z } from "zod";

const EpisodeAddress = z.object({
	seriesId: z.string(),
	episode: z.coerce.number().int().positive(),
});

export const getEpisode = query(EpisodeAddress, async ({ seriesId, episode }) => {
	const [series, episodes] = await Promise.all([sora.series(seriesId), sora.episodes(seriesId)]);
	const found = episodes.find((candidate) => candidate.number === episode);

	if (!found) {
		error(404, "Episode not found");
	}

	return {
		series,
		episode: found,
	};
});

export const getPlayback = query(EpisodeAddress, async ({ seriesId, episode }) => {
	const playback = await attempt(
		sora.playback(
			{
				seriesId,
				number: episode,
			},
			{
				meta: true,
			},
		),
		SoraError,
	);
	if (playback.error) {
		return {
			media: [],
			next: null,
			previous: null,
		};
	}

	const { results, meta } = playback.data;
	const number = (path: string | null) => {
		const match = path?.match(/\/episodes\/(\d+)\/playback$/);
		return match ? Number(match[1]) : null;
	};

	return {
		media: results,
		next: number(meta.next),
		previous: number(meta.previous),
	};
});

export const getPlaybackPreferences = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.playbackPreferences(viewer.profile.id);
});

export const getProgress = query(EpisodeAddress, async ({ seriesId, episode }) => {
	const viewer = remoteViewer();

	return viewer.sora.progress(viewer.profile.id, {
		seriesId,
		number: episode,
	});
});

export const saveProgress = command(
	z.object({
		seriesId: z.string(),
		episode: z.number().int().positive(),
		position_seconds: z.number().int().nonnegative(),
		duration_seconds: z.number().int().positive(),
		finished: z.boolean(),
		leaving: z.boolean(),
	}),
	async ({ seriesId, episode, leaving, ...progress }) => {
		const viewer = remoteViewer();

		await viewer.sora.saveProgress(
			viewer.profile.id,
			{
				seriesId,
				number: episode,
			},
			progress,
		);

		if (leaving) {
			await Promise.all([
				getSeriesProgress(seriesId).refresh(),
				getContinueWatching().refresh(),
				getWatchlist().refresh(),
			]);
		} else if (progress.finished) {
			await getWatchlist().refresh();
		}
	},
);

const SubtitleChoice = z
	.object({
		language: z.string(),
		kind: z.enum(["dialogue", "signs", "captions"]).nullable(),
	})
	.nullable();

export const savePlaybackPreferences = command(
	z.object({
		audio: z.enum(["sub", "dub", "raw"]).nullable().optional(),
		subtitles: z
			.object({
				sub: SubtitleChoice.optional(),
				dub: SubtitleChoice.optional(),
			})
			.optional(),
		auto_skip: z.boolean().optional(),
	}),
	async (changes) => {
		const viewer = remoteViewer();

		getPlaybackPreferences().set(
			await viewer.sora.updatePlaybackPreferences(viewer.profile.id, changes),
		);
	},
);
