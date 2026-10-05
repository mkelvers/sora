import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getSeriesProgress } from "$routes/(app)/series/[id]/series.remote";
import { refreshStatus, refreshTracking } from "$routes/(app)/series/[id]/tracking.server";
import { route, SoraError, type PlaybackMedia } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error } from "@sveltejs/kit";
import { z } from "zod";

export type WatchMedia = Omit<PlaybackMedia, "provider" | "locale" | "hardsub">;

const EpisodeAddress = z.object({
	seriesId: z.string(),
	episode: z.coerce.number().int().positive(),
});

export const getEpisode = query(EpisodeAddress, async ({ seriesId, episode }) => {
	const params = {
		series_id: seriesId,
	};
	const { sora } = remoteViewer();
	const [series, episodes] = await Promise.all([
		sora.request(route.getSeries, {
			params,
		}),
		sora.request(route.listEpisodes, {
			params,
		}),
	]);
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
		remoteViewer().sora.requestWithMeta(route.getPlayback, {
			params: {
				series_id: seriesId,
				episode,
			},
		}),
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

	const streamPath = (url: string) => `/stream/${new URL(url).pathname.split("/").pop()}`;

	return {
		media: results.map(
			({
				provider: _provider,
				locale: _locale,
				hardsub: _hardsub,
				sources,
				subtitles,
				...rest
			}) => ({
				...rest,
				sources: sources.map((source) => ({
					...source,
					url: streamPath(source.url),
				})),
				subtitles: subtitles.map((track) => ({
					...track,
					url: streamPath(track.url),
				})),
			}),
		),
		next: number(meta.next),
		previous: number(meta.previous),
	};
});

export const getPlaybackPreferences = query(async () => {
	const viewer = remoteViewer();

	return viewer.sora.request(route.getPlaybackPreferences, {
		params: {
			profile_id: viewer.profile.id,
		},
	});
});

export const getProgress = query(EpisodeAddress, async ({ seriesId, episode }) => {
	const viewer = remoteViewer();

	return viewer.sora.request(route.getProgress, {
		params: {
			profile_id: viewer.profile.id,
			series_id: seriesId,
			episode,
		},
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

		await viewer.sora.request(route.saveProgress, {
			params: {
				profile_id: viewer.profile.id,
				series_id: seriesId,
				episode,
			},
			body: progress,
		});

		if (leaving) {
			await Promise.all([getSeriesProgress(seriesId).refresh(), refreshTracking()]);
		} else if (progress.finished) {
			await refreshStatus();
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
			await viewer.sora.request(route.updatePlaybackPreferences, {
				params: {
					profile_id: viewer.profile.id,
				},
				body: changes,
			}),
		);
	},
);
