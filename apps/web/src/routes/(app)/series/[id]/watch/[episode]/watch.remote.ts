import { command, query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { getSeriesProgress } from "$routes/(app)/series/[id]/series.remote";
import { refreshStatus, refreshTracking } from "$routes/(app)/tracking.server";
import { route, SoraError } from "@sora/sdk";
import type { PlaybackMedia } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { error } from "@sveltejs/kit";
import { z } from "zod";

export type WatchMedia = Omit<PlaybackMedia, "provider" | "locale" | "hardsub">;

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

export const getPlayback = query(EpisodeAddress, async ({ seriesId, episode }) => {
	const playback = await attempt(
		remoteViewer().sora.requestWithMeta(route.getPlayback, {
			params: {
				episode,
				series_id: seriesId,
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
			episode,
			profile_id: profile.id,
			series_id: seriesId,
		},
	});
});

export const saveProgress = command(
	z.object({
		duration_seconds: z.number().int().positive(),
		episode: z.number().int().positive(),
		finished: z.boolean(),
		leaving: z.boolean(),
		position_seconds: z.number().int().nonnegative(),
		seriesId: z.string(),
	}),
	async ({ seriesId, episode, leaving, ...progress }) => {
		const { sora, profile } = remoteViewer();

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

const SubtitleChoice = z
	.object({
		kind: z.enum(["dialogue", "signs", "captions"]).nullable(),
		language: z.string(),
	})
	.nullable();

export const savePlaybackPreferences = command(
	z.object({
		audio: z.enum(["sub", "dub", "raw"]).nullable().optional(),
		auto_skip: z.boolean().optional(),
		subtitles: z
			.object({
				sub: SubtitleChoice.optional(),
				dub: SubtitleChoice.optional(),
			})
			.optional(),
	}),
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
