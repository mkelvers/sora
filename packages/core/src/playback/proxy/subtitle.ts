import { shiftTime } from "../streams/align";
import type { TimelineShift } from "../streams/align";
import type { CueAnchor } from "../subtitles/refine";
import { readTiming, splitBlocks, writeTiming } from "../subtitles/vtt";

/** How much of a cue an anchor's cue must overlap for them to be the same line. */
const sameCueOverlap = 0.6;

/** The anchor, from ascending `anchors`, whose cue is this one. */
const anchorFor = (anchors: CueAnchor[], start: number, end: number) => {
	let low = 0;
	let high = anchors.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (anchors[middle]!.start < start) {
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
