import { defined } from "@sora/shared";

import { shiftTime } from "../streams/align";
import type { TimelineShift } from "../streams/align";
import type { CueAnchor } from "../subtitles/refine";
import { readTiming, splitBlocks, writeTiming } from "../subtitles/vtt";

/** ASS override blocks, such as `{\an8}` or `{\i1}`. */
const assOverride = /\{\\[^}]*\}/gu;

/** Spaces at the start or end of a line, hard spaces included. */
const lineEdgeSpace = /^[ \t\u00A0]+|[ \t\u00A0]+$/gmu;

/**
 * Cue text with what ASS conversions leave behind turned into plain text:
 * override blocks removed, `\N` as a line break, `\n` as a space, and `\h` as a
 * non-breaking space. Hard spaces that only indent a line, which ASS uses to
 * stagger words across lines, are dropped because cues are centred.
 */
const cleanText = (text: string) =>
	text
		.replaceAll(assOverride, "")
		.replaceAll("\\N", "\n")
		.replaceAll("\\n", " ")
		.replaceAll("\\h", "\u00A0")
		.replaceAll(lineEdgeSpace, "")
		.trim();

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
			const text = cleanText(match?.groups?.text ?? "");

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

/** The anchor, from ascending `anchors`, whose cue is this one. */
const anchorFor = (anchors: CueAnchor[], start: number, end: number) => {
	/** How much of a cue an anchor's cue must overlap for them to be the same line. */
	const sameCueOverlap = 0.6;

	let low = 0;
	let high = anchors.length;

	while (low < high) {
		const middle = Math.floor((low + high) / 2);

		if (defined(anchors[middle]).start < start) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}

	let best: CueAnchor | null = null;
	let bestOverlap = sameCueOverlap;

	for (const anchor of anchors.slice(Math.max(0, low - 2), low + 3)) {
		const overlap =
			Math.max(0, Math.min(end, anchor.end) - Math.max(start, anchor.start)) /
			Math.max(end - start, anchor.end - anchor.start, 0.001);

		if (overlap >= bestOverlap) {
			best = anchor;
			bestOverlap = overlap;
		}
	}

	return best;
};

/**
 * Moves every cue of a WebVTT file onto another encode's timeline, such as a
 * sub's subtitles onto its dub.
 *
 * A cue with an anchor, which is a cue of the sub's English dialogue that
 * was matched to what the dub says, goes where the anchor puts it. That
 * covers the same cue in other languages, which providers time alike. Any
 * other cue keeps its length and moves by the shift at its start, and is
 * dropped when that would put it before the video.
 */
export const retimeWebVtt = (content: string, shifts: TimelineShift[], anchors: CueAnchor[] = []) =>
	splitBlocks(content)
		.flatMap((block) => {
			const cue = readTiming(block);

			if (!cue) {
				return [block];
			}

			const anchor = anchorFor(anchors, cue.start, cue.end);

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
