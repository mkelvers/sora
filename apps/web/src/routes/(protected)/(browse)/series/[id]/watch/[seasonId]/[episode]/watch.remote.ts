import { command, query } from "$app/server";
import { remoteViewer, sora } from "$lib/server/sora";
import { getContinueWatching } from "$routes/(protected)/(browse)/home.remote";
import { getProgress } from "$routes/(protected)/(browse)/series/[id]/series.remote";
import { SoraError } from "@sora/sdk";
import { error } from "@sveltejs/kit";
import { z } from "zod";

const EpisodeAddress = z.object({
	seriesId: z.string(),
	seasonId: z.string(),
	episode: z.coerce.number().int().positive(),
});

export const getEpisode = query(EpisodeAddress, async ({ seriesId, seasonId, episode }) => {
	const viewer = remoteViewer();

	const [series, episodes, progress] = await Promise.all([
		sora.series(seriesId),
		sora.episodes({
			seriesId,
			seasonId,
		}),
		viewer.sora.progress(viewer.profile.id, seriesId),
	]);
	const season = series.seasons.find((season) => season.id === seasonId);
	const found = episodes.find((candidate) => candidate.number === episode);

	if (!season || !found) {
		error(404, "Episode not found");
	}

	const checkpoint = progress.episodes.find(
		(checkpoint) => checkpoint.season_id === seasonId && checkpoint.episode === episode,
	);
	const { next } = progress;

	return {
		series,
		season,
		episode: found,
		start:
			next?.season_id === seasonId && next.episode === episode
				? next.position_seconds
				: checkpoint && !checkpoint.watched
					? checkpoint.position_seconds
					: 0,
	};
});

export const saveProgress = command(
	z.object({
		seriesId: z.string(),
		seasonId: z.string(),
		episode: z.number().int().positive(),
		position: z.number().nonnegative(),
		duration: z.number().positive(),
	}),
	async ({ seriesId, seasonId, episode, position, duration }) => {
		const viewer = remoteViewer();

		await viewer.sora.recordProgress(viewer.profile.id, {
			season_id: seasonId,
			episode,
			position_seconds: Math.min(position, duration),
			duration_seconds: duration,
		});
		await Promise.all([getProgress(seriesId).refresh(), getContinueWatching().refresh()]);
	},
);

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
