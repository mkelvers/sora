import type { Task } from "graphile-worker";
import { z } from "zod";

import { config } from "../../config";
import { SubtitleRefinementError } from "../../playback/subtitles/audio";
import { listenToDub } from "../../playback/subtitles/listen";
import { getRefinement, isRefinementDue, saveRefinement } from "../../playback/subtitles/store";

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

	const { seriesId, episode, key } = PayloadSchema.parse(payload);
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
