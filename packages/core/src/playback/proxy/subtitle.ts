import { shiftTime } from "../streams/align";
import type { TimelineShift } from "../streams/align";
import type { CueAnchor } from "../subtitles/refine";
import { readTiming, splitBlocks, writeTiming } from "../subtitles/vtt";
import { Anchors } from "./anchors";
import { CueText } from "./cue-text";

/**
 * A WebVTT file with ASS escapes in its cue text cleaned up, and cues left
 * with no text dropped. Providers convert ASS subtitles to WebVTT without
 * translating them, and players show them as written. A cue with the same
 * timing, settings, and text as an earlier one is dropped too: ASS draws a
 * sign as stacked layers, such as a shadow under its text, which become
 * copies of one cue.
 */
export const cleanWebVtt = (content: string) => {
	/** A cue block's timing line, through its line break, and the text after it. */
	const cueText = /^(?<head>[^\n]*-->[^\n]*\n)(?<text>[\s\S]*)$/mu;

	const seen = new Set<string>();

	return splitBlocks(content)
		.flatMap((block) => {
			if (!readTiming(block)) {
				return [block];
			}

			const lines = block.replaceAll("\r\n", "\n");
			const match = cueText.exec(lines);
			const text = new CueText(match?.groups?.text ?? "").clean;

			if (!match || !text) {
				return [];
			}

			const cue = `${match.groups?.head}${text}`;

			if (seen.has(cue)) {
				return [];
			}

			seen.add(cue);

			return [`${lines.slice(0, match.index)}${match.groups?.head}${text}`];
		})
		.join("\n\n");
};

/**
 * Moves every cue of a WebVTT file onto another encode's timeline, such as a
 * sub's subtitles onto its dub.
 *
 * A cue with an anchor, which is a cue of the sub's English dialogue that
 * was sorted to what the dub says, goes where the anchor puts it. That
 * covers the same cue in other languages, which providers time alike. Any
 * other cue keeps its length and moves by the shift at its start, and is
 * dropped when that would put it before the video.
 */
export const retimeWebVtt = (
	content: string,
	shifts: TimelineShift[],
	anchors: CueAnchor[] = [],
) => {
	const sorted = new Anchors(anchors);

	return splitBlocks(content)
		.flatMap((block) => {
			const cue = readTiming(block);

			if (!cue) {
				return [block];
			}

			const anchor = sorted.match(cue.start, cue.end);

			if (anchor) {
				return [writeTiming(block, anchor.movedStart, anchor.movedEnd)];
			}

			const moved = shiftTime(shifts, cue.start);

			if (moved < 0) {
				return [];
			}

			return [writeTiming(block, moved, cue.end + moved - cue.start)];
		})
		.join("\n\n");
};
