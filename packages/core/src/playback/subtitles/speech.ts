import { fileURLToPath } from "node:url";

import { second } from "@sora/shared";
import { z } from "zod";

import { config } from "../../config";
import { SubtitleRefinementError } from "./audio";
import type { SpokenWord } from "./refine";

const SpeechSchema = z.object({
	words: z.array(
		z.object({
			text: z.string(),
			start: z.number(),
			end: z.number(),
		}),
	),
});

/** Listening runs at several times real time on a laptop; this leaves room for a slow server. */
const timeoutMs = 90 * 60 * second;

const script = fileURLToPath(new URL("./transcribe.py", import.meta.url));

/**
 * The words spoken in a 16 kHz mono WAV file and when, found by running
 * `faster-whisper` through the Python in `SUBTITLE_ALIGNMENT_PYTHON`.
 *
 * @throws {@link SubtitleRefinementError} when no Python is configured or
 *   transcribing fails.
 */
export async function transcribe(path: string): Promise<SpokenWord[]> {
	if (!config.subtitleAlignmentPython) {
		throw new SubtitleRefinementError("SUBTITLE_ALIGNMENT_PYTHON is not set");
	}

	const child = Bun.spawn(
		[config.subtitleAlignmentPython, script, path, config.subtitleAlignmentModel],
		{
			stdout: "pipe",
			stderr: "pipe",
			timeout: timeoutMs,
		},
	);
	const [output, failure, code] = await Promise.all([
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
		child.exited,
	]);
	if (code !== 0) {
		throw new SubtitleRefinementError(`Transcribing failed: ${failure.trim().split("\n").at(-1)}`);
	}

	return SpeechSchema.parse(JSON.parse(output)).words;
}
