import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { isServedSubtitle } from "../providers/registry";
import { readSubtitle } from "../proxy/proxy";
import { mirrorsFor } from "../proxy/upstream";
import { resolveStreams, timelineShifts } from "../streams/resolve";
import { subtitleKinds } from "../streams/subtitle-kinds";
import { extractAudio, SubtitleRefinementError } from "./audio";
import { refineCues } from "./refine";
import type { Refinement } from "./refine";
import { transcribe } from "./speech";
import { refinementKey } from "./store";
import { readCues } from "./vtt";

/** A track with fewer cues than this is not a script to match speech against. */
const minimumCues = 40;

/** The cues of the sub's English dialogue track, or none when it has no such track. */
const englishDialogue = async (
	videos: NonNullable<Awaited<ReturnType<typeof resolveStreams>>["sub"]>,
) => {
	const kinds = await subtitleKinds(videos);
	const tracks = videos
		.flatMap((video) =>
			video.subtitles
				.filter((track) => isServedSubtitle(track) && track.format === "vtt")
				.map((track) => ({
					track,
					video,
				})),
		)
		.filter(({ track }) => (kinds.get(track.url) ?? "dialogue") === "dialogue");

	for (const { track, video } of tracks) {
		const content = await readSubtitle(track.url, video.headers, mirrorsFor(track.url, video.url));
		if (content) {
			return readCues(content);
		}
	}
	return [];
};

/**
 * Listens to an episode's dub and finds when each line of the sub's English
 * subtitles is said; see {@link refineCues}.
 *
 * @param key - What {@link refinementKey} gave the pair of encodes the request
 *   was made for. The pair may have changed since, such as when a provider
 *   went down, and then nothing is stored under it.
 * @returns `null` when the dub's speech does not match the sub's script.
 * @throws {SubtitleRefinementError} when the episode cannot be streamed
 *   in both versions right now, or the audio cannot be read or transcribed.
 */
export const listenToDub = async (
	request: { seriesId: string; episode: number },
	key: string,
): Promise<Refinement | null> => {
	const { sub, dub } = await resolveStreams(request);
	const subVideo = sub?.find((video) => video.format === "hls");
	const dubVideo = dub?.find((video) => video.format === "hls");
	if (!sub || !dub || !subVideo || !dubVideo) {
		throw new SubtitleRefinementError("The sub and the dub cannot both be streamed");
	}
	if (refinementKey(subVideo.url, dubVideo.url) !== key) {
		throw new SubtitleRefinementError("The streams changed since the request");
	}

	const cues = await englishDialogue(sub);
	if (cues.length < minimumCues) {
		return null;
	}

	const picture = await timelineShifts(sub, dub);
	const directory = await mkdtemp(path.join(tmpdir(), "sora-dub-"));
	try {
		const audio = path.join(directory, "audio.wav");
		await extractAudio(dubVideo.url, dubVideo.headers, audio);
		return refineCues(cues, await transcribe(audio), picture);
	} finally {
		await rm(directory, {
			force: true,
			recursive: true,
		});
	}
};
