import { command, query } from "$app/server";
import { getNotifications, getUnreadNotifications } from "$lib/notifications.remote";
import { remoteViewer, sora } from "$lib/server/sora";
import { getHistory, getShows } from "$lib/shows.remote";
import { getContinueWatching } from "$routes/(protected)/(browse)/home.remote";
import { getSeriesProgress } from "$routes/(protected)/(browse)/series/[id]/series.remote";
import { SoraError } from "@sora/sdk";
import { error } from "@sveltejs/kit";
import { z } from "zod";

const EpisodeAddress = z.object({
	seriesId: z.string(),
	seasonId: z.string(),
	episode: z.coerce.number().int().positive(),
});

export const getEpisode = query(EpisodeAddress, async ({ seriesId, seasonId, episode }) => {
	const [series, episodes] = await Promise.all([
		sora.series(seriesId),
		sora.episodes({
			seriesId,
			seasonId,
		}),
	]);
	const season = series.seasons.find((season) => season.id === seasonId);
	const found = episodes.find((candidate) => candidate.number === episode);

	if (!season || !found) {
		error(404, "Episode not found");
	}

	return {
		series,
		season,
		episode: found,
	};
});

export const getPlayback = query(EpisodeAddress, async ({ seasonId, episode }) => {
	try {
		const { results, meta } = await sora.playback(
			{
				seasonId,
				number: episode,
			},
			{
				meta: true,
			},
		);
		const address = (path: string | null) => {
			const match = path?.match(/\/seasons\/([^/]+)\/episodes\/(\d+)\/playback$/);
			return match
				? {
						season_id: match[1]!,
						episode: Number(match[2]),
					}
				: null;
		};

		return {
			media: results,
			next: address(meta.next),
			previous: address(meta.previous),
		};
	} catch (cause) {
		if (cause instanceof SoraError) {
			return {
				media: [],
				next: null,
				previous: null,
			};
		}
		throw cause;
	}
});

export const getPlaybackPreferences = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.playbackPreferences(viewer.profile.id);
});

export const getProgress = query(EpisodeAddress, async ({ seasonId, episode }) => {
	const viewer = remoteViewer();

	return viewer.sora.progress(viewer.profile.id, {
		seasonId,
		number: episode,
	});
});

export const saveProgress = command(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
		episode: z.number().int().positive(),
		position_seconds: z.number().int().nonnegative(),
		duration_seconds: z.number().int().positive(),
		finished: z.boolean(),
		leaving: z.boolean(),
	}),
	async ({ seriesId, seasonId, episode, leaving, ...progress }) => {
		const viewer = remoteViewer();

		await viewer.sora.saveProgress(
			viewer.profile.id,
			{
				seasonId,
				number: episode,
			},
			progress,
		);

		if (leaving) {
			await Promise.all([
				getSeriesProgress(seriesId).refresh(),
				getContinueWatching().refresh(),
				getShows().refresh(),
				getHistory(undefined).refresh(),
				getNotifications().refresh(),
				getUnreadNotifications().refresh(),
			]);
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
