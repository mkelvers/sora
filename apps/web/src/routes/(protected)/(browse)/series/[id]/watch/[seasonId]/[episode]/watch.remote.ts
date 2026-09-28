import { command, getRequestEvent, query } from "$app/server";
import { sora } from "$lib/server/sora";
import { SoraError } from "@sora/sdk";
import { error } from "@sveltejs/kit";
import { z } from "zod";

const EpisodeAddress = z.object({
	seriesId: z.string(),
	seasonId: z.string(),
	episode: z.coerce.number().int().positive(),
});

export const getEpisode = query(EpisodeAddress, async ({ seriesId, seasonId, episode }) => {
	const { viewer } = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

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

	return {
		series,
		season,
		episode: found,
		start: checkpoint && !checkpoint.completed ? checkpoint.position_seconds : 0,
	};
});

export const saveProgress = command(
	z.object({
		seasonId: z.string(),
		episode: z.number().int().positive(),
		position: z.number().nonnegative(),
		duration: z.number().positive(),
	}),
	async ({ seasonId, episode, position, duration }) => {
		const { viewer } = getRequestEvent().locals;
		if (!viewer?.profile) {
			error(403, "Choose a profile first");
		}

		await viewer.sora.recordProgress(viewer.profile.id, {
			season_id: seasonId,
			episode,
			position_seconds: Math.min(position, duration),
			duration_seconds: duration,
		});
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
			problem: null,
			next: address(meta.next),
			previous: address(meta.previous),
		};
	} catch (cause) {
		if (cause instanceof SoraError) {
			return {
				media: [],
				problem: cause.message,
				next: null,
				previous: null,
			};
		}
		throw cause;
	}
});
