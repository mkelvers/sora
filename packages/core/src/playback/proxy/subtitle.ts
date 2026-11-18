import { defined } from "@sora/shared";

import { shiftTime } from "../streams/align";
import type { TimelineShift } from "../streams/align";
import type { CueAnchor } from "../subtitles/refine";
import { readTiming, splitBlocks, writeTiming } from "../subtitles/vtt";

/** ASS override blocks, such as `{\an8}` or `{\i1}`. */
const assOverride = /\{\\[^}]*\}/gu;

/** Spaces at the start or end of a line, hard spaces included. */
const lineEdgeSpace = /^[ \t\u00A0]+|[ \t\u00A0]+$/gmu;

/** A cue block's timing line, through its line break, and the text after it. */
const cueText = /^(?<head>[^\n]*-->[^\n]*\n)(?<text>[\s\S]*)$/mu;

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
 * Cue text that is bold as a whole. Tracks converted from Crunchyroll's
 * subtitles mark the translation of text shown on screen, such as signs,
 * titles, and skill names, this way, and dialogue never.
 */
const wholeBold = /^<b>[\s\S]*<\/b>$/u;

const markup = /<[^>]*>/gu;
const word = /[\p{L}\p{N}]+/gu;

/** The words of cue text, lowercased, without markup or punctuation. */
const wordsOf = (text: string) => text.replaceAll(markup, "").toLowerCase().match(word) ?? [];

/**
 * The share of a sign's words that dialogue shown with it must say for the
 * sign to repeat it. Below this the sign carries something of its own.
 */
const repeatedShare = 0.8;

/** A cue's span, in seconds, and its cleaned text. */
interface TimedText {
	start: number;
	end: number;
	text: string;
}

/** A block of a WebVTT file, with its cue when it is one. */
interface CleanBlock {
	block: string;
	cue: TimedText | null;
}

/**
 * Whether a sign only repeats what dialogue shown at the same time says, as
 * when a character reads it out: "Magicules" on screen while the line is
 * "Magicules?".
 */
const repeatsDialogue = (sign: TimedText, dialogue: TimedText[]) => {
	const words = wordsOf(sign.text);
	if (words.length === 0) {
		return false;
	}

	const said = new Set(
		dialogue
			.filter((line) => line.start < sign.end && line.end > sign.start)
			.flatMap((line) => wordsOf(line.text)),
	);
	return words.filter((candidate) => said.has(candidate)).length / words.length >= repeatedShare;
};

/**
 * A WebVTT file with ASS escapes in its cue text cleaned up, and cues left
 * with no text dropped. Providers convert ASS subtitles to WebVTT without
 * translating them, and players show them as written.
 *
 * Two kinds of cue that only repeat another are dropped too, since players
 * stack every cue at the bottom and a repeat doubles what there is to read:
 *
 * - A cue with the same timing, settings, and text as an earlier one: ASS
 *   draws a sign as stacked layers, such as a shadow under its text, which
 *   become copies of one cue.
 * - A sign whose words the dialogue shown with it says, such as a skill name
 *   on screen while a character announces it.
 */
export const cleanWebVtt = (content: string) => {
	const seen = new Set<string>();
	const blocks = splitBlocks(content).flatMap((block): CleanBlock[] => {
		const timing = readTiming(block);
		if (!timing) {
			return [
				{
					block,
					cue: null,
				},
			];
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

		return [
			{
				block: `${lines.slice(0, match.index)}${match.groups?.head}${text}`,
				cue: {
					end: timing.end,
					start: timing.start,
					text,
				},
			},
		];
	});

	const dialogue = blocks.flatMap(({ cue }) => (cue && !wholeBold.test(cue.text) ? [cue] : []));
	return blocks
		.filter(({ cue }) => !cue || !wholeBold.test(cue.text) || !repeatsDialogue(cue, dialogue))
		.map(({ block }) => block)
		.join("\n\n");
};

/** How much of a cue an anchor's cue must overlap for them to be the same line. */
const sameCueOverlap = 0.6;

/** The anchor, from ascending `anchors`, whose cue is this one. */
const anchorFor = (anchors: CueAnchor[], start: number, end: number) => {
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
