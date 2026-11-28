import { fileURLToPath } from "node:url";

import { minute } from "@sora/shared";
import { z } from "zod";

import { config } from "../../config";
import { heavyWork } from "../../heavy-work";
import { SubtitleRefinementError } from "./audio";
import type { SpokenWord } from "./refine";

/**
 * The words spoken in a 16 kHz mono WAV file and when, found by running
 * `faster-whisper` through the Python in `SUBTITLE_ALIGNMENT_PYTHON`. Waits,
 * and pauses, while the machine's battery cannot carry it; see {@link heavyWork}.
 *
 * @throws {SubtitleRefinementError} when no Python is configured or
 *   transcribing fails.
 */
export const transcribe = async (path: string): Promise<SpokenWord[]> => {
	/**
	 * Listening runs at several times real time on a laptop; this leaves room
	 * for a slow server. Counts only the time it runs; see {@link heavyWork}.
	 */
	const timeoutMinutes = 90;

	const OutputSchema = z.object({
		words: z.array(
			z.object({
				end: z.number(),
				start: z.number(),
				text: z.string(),
			}),
		),
	});

	const script = fileURLToPath(new URL("transcribe.py", import.meta.url));

	if (!config.subtitleAlignmentPython) {
		throw new SubtitleRefinementError("SUBTITLE_ALIGNMENT_PYTHON is not set");
	}

	const finished = await heavyWork.run(
		[config.subtitleAlignmentPython, script, path, config.subtitleAlignmentModel],
		timeoutMinutes * minute,
	);

	if (finished.timedOut) {
		throw new SubtitleRefinementError(`Transcribing ran longer than ${timeoutMinutes} minutes`);
	}

	if (finished.code !== 0) {
		throw new SubtitleRefinementError(
			`Transcribing failed: ${finished.stderr.trim().split("\n").at(-1)}`,
		);
	}

	return OutputSchema.parse(JSON.parse(finished.stdout)).words;
};
