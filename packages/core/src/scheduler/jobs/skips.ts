import { attempt, inSequence } from "@sora/shared";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { getAnime } from "../../catalog/queries/anime";
import { EpisodeNotFoundError, PlaybackUnavailableError, SeriesNotFoundError } from "../../errors";
import { detectSkipSegments, listenToSong } from "../../playback/skips/detect";
import type { ListenedSong } from "../../playback/skips/detect";
import {
	episodeDetectionKey,
	getSkipDetections,
	isSkipDetectionDue,
	saveSkipDetection,
	skipDetectionKey,
} from "../../playback/skips/store";
import { themeSongsFor } from "../../playback/skips/themes";
import { resolveVideos } from "../../playback/streams/resolve";
import { locateEpisode } from "../../series/episodes";
import { parsePayload } from "../payload";

const PayloadSchema = z.object({
	ahead: z.boolean().default(false),
	episode: z.number().int().positive(),
	seriesId: z.string().min(1),
});

const unsettled = {
	ending: null,
	opening: null,
};

/**
 * Finds where an episode's opening and ending songs play in each of its
 * videos that is due (see `isSkipDetectionDue`), by looking for the songs
 * AnimeThemes has for the anime in the videos' audio, and stores the spans;
 * playback puts them in place of the provider's skip segments (see
 * `withDetection`).
 *
 * The songs are fetched once for all the episode's videos, and nothing but
 * the spans is kept. A video due only because something was left unsettled
 * is read again only when AnimeThemes has more songs for it than last time.
 * A song or video that cannot be read is passed over, the video stored as
 * unsettled so it is tried again in two weeks rather than every day.
 */
export const detectSkipSegmentsJob: Task = async (payload, helpers) => {
	const { ahead, ...request } = parsePayload(PayloadSchema, payload);
	const marker = episodeDetectionKey(request.seriesId, request.episode);
	if (ahead) {
		const markers = await getSkipDetections([marker]);
		if (!isSkipDetectionDue(markers.get(marker))) {
			return;
		}
	}

	const located = await attempt(
		locateEpisode(request.seriesId, request.episode),
		EpisodeNotFoundError,
		SeriesNotFoundError,
	);
	if (located.error) {
		// The episode after a series' last is asked for too.
		return;
	}

	const versions = await attempt(
		resolveVideos(request),
		PlaybackUnavailableError,
		EpisodeNotFoundError,
	);
	if (versions.error) {
		helpers.logger.info(
			`No video to look at for ${request.seriesId} ${request.episode}: ${versions.error.message}`,
		);
		return;
	}

	const videos = versions.data.flatMap(({ videos: candidates }) => {
		const video = candidates.find((candidate) => candidate.format === "hls");
		return video
			? [
					{
						key: skipDetectionKey(video.url),
						video,
					},
				]
			: [];
	});
	const stored = await getSkipDetections(videos.map(({ key }) => key));
	const due = videos.filter(({ key }) => isSkipDetectionDue(stored.get(key)));

	const songs =
		due.length > 0
			? await themeSongsFor(await getAnime(located.data.anilistId), located.data.number)
			: [];
	const listened = await inSequence(songs, async (song) => {
		const { data, error } = await attempt(listenToSong(song));
		if (error) {
			helpers.logger.info(`Could not read ${song.slug} of ${request.seriesId}: ${error.message}`);
		}
		return data;
	});
	const heard = listened.filter((song): song is ListenedSong => song !== undefined);

	await inSequence(due, async ({ key, video }) => {
		const previous = stored.get(key);
		if (previous && previous.songs >= heard.length) {
			// Nothing new to look for: kept as it was until it is due again.
			await saveSkipDetection(key, previous.detection, previous.songs);
			return;
		}
		if (heard.length === 0) {
			await saveSkipDetection(key, unsettled, 0);
			return;
		}

		const { data: detection, error } = await attempt(detectSkipSegments(video, heard));
		if (error) {
			helpers.logger.info(
				`Could not look at ${request.seriesId} ${request.episode}: ${error.message}`,
			);
		}
		await saveSkipDetection(key, detection ?? unsettled, heard.length);
		helpers.logger.info(
			`${request.seriesId} ${request.episode}: opening ${JSON.stringify(detection?.opening ?? null)}, ending ${JSON.stringify(detection?.ending ?? null)}`,
		);
	});

	await saveSkipDetection(marker, unsettled, heard.length);
};
