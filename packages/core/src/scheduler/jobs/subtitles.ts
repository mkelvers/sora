import { attempt } from "@sora/shared";
import type { Task } from "graphile-worker";
import { z } from "zod";

import { config } from "../../config";
import { EpisodeNotFoundError, SeriesNotFoundError } from "../../errors";
import { probeSubtitleLanguages } from "../../playback/streams/resolve";
import { recordSubtitleLanguages } from "../../playback/streams/subtitle-languages";
import { SubtitleRefinementError } from "../../playback/subtitles/audio";
import { listenToDub } from "../../playback/subtitles/listen";
import { getRefinement, isRefinementDue, saveRefinement } from "../../playback/subtitles/store";
import { parsePayload } from "../payload";

const PayloadSchema = z.object({
	episode: z.number().int().positive(),
	key: z.string().min(1),
	seriesId: z.string().min(1),
});

/**
 * Times the sub's subtitles to when the dub's characters speak, by
 * transcribing the dub's audio, and stores where each cue goes; see
 * `listenToDub`. Playback uses it from then on. A dub that does not speak
 * the sub's script is recorded as such and tried again in a week.
 */
export const refineSubtitles: Task = async (payload) => {
	if (!config.subtitleAlignmentPython) {
		throw new SubtitleRefinementError("SUBTITLE_ALIGNMENT_PYTHON is not set");
	}

	const { seriesId, episode, key } = parsePayload(PayloadSchema, payload);
	if (!isRefinementDue(await getRefinement(key))) {
		return;
	}

	const refinement = await listenToDub(
		{
			episode,
			seriesId,
		},
		key,
	);
	await saveRefinement(key, refinement);
};

const ProbePayloadSchema = z.object({
	seriesId: z.string().min(1),
});

/**
 * Looks at which subtitle languages a series' first episode streams with,
 * for a series nobody has played yet; see `probeSubtitleLanguages`. A series
 * without a first episode stores none, so it is not asked about again.
 */
export const probeSubtitles: Task = async (payload, helpers) => {
	const { seriesId } = parsePayload(ProbePayloadSchema, payload);
	const { data, error } = await attempt(
		probeSubtitleLanguages({
			episode: 1,
			seriesId,
		}),
		EpisodeNotFoundError,
		SeriesNotFoundError,
	);
	if (error instanceof EpisodeNotFoundError) {
		await recordSubtitleLanguages(seriesId, []);
	}
	if (error) {
		helpers.logger.info(`No subtitles to look at for ${seriesId}: ${error.message}`);
		return;
	}

	helpers.logger.info(`${seriesId} has subtitles in ${data.join(", ") || "no language"}`);
};
