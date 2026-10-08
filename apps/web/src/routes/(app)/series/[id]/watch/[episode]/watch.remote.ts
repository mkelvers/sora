import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getSeriesProgress } from "$routes/(app)/series/[id]/series.remote";
import { refreshStatus, refreshTracking } from "$routes/(app)/tracking.server";
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
					series_id: seriesId,
					episode,
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
		series: found.data[0],
		episode: found.data[1],
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
	const proxied = (url: string) => `/api/stream/${new URL(url).pathname.split("/").pop()}`;

	return {
		media: results.map(({ provider: _provider, locale: _locale, hardsub: _hardsub, ...media }) => ({
			...media,
			sources: media.sources.map((source) => ({
				...source,
				url: proxied(source.url),
			})),
			subtitles: media.subtitles.map((track) => ({
				...track,
				url: proxied(track.url),
			})),
		})),
		next: meta.next_episode,
		previous: meta.previous_episode,
	};
});

export const getPlaybackPreferences = query(async () => {
	const { sora, profile } = remoteViewer();

	return sora.request(route.getPlaybackPreferences, {
		params: {
			profile_id: profile.id,
		},
	});
});

export const getProgress = query(EpisodeAddress, async ({ seriesId, episode }) => {
	const { sora, profile } = remoteViewer();

	return sora.request(route.getProgress, {
		params: {
			profile_id: profile.id,
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
		const { sora, profile } = remoteViewer();

		await sora.request(route.saveProgress, {
			params: {
				profile_id: profile.id,
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
		const { sora, profile } = remoteViewer();

		getPlaybackPreferences().set(
			await sora.request(route.updatePlaybackPreferences, {
				params: {
					profile_id: profile.id,
				},
				body: changes,
			}),
		);
	},
);
