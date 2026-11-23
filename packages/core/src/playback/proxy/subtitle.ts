import { shiftTime } from "../streams/align";
import type { TimelineShift } from "../streams/align";
import type { CueAnchor } from "../subtitles/refine";
import { readTiming, splitBlocks, writeTiming } from "../subtitles/vtt";
import { Anchors } from "./anchors";
import { CueText } from "./cue-text";
import { MisreadFile } from "./misread";

/** A cue's timing line, without its line break. */
const timingLine = /^[^\n]*-->[^\n]*/mu;

/** A cue of a WebVTT file, as {@link cleanWebVtt} reads it. */
interface CleanCue {
	start: number;
	end: number;
	settings: string;
	text: CueText;
}

/** A block of a WebVTT file, with its cue when it is one. */
interface CleanBlock {
	block: string;
	cue: CleanCue | null;
}

/**
 * A WebVTT file made easier to read: ASS escapes in cue text cleaned up, cues
 * that only repeat another dropped, and signs moved to the top of the picture.
 *
 * - Providers convert ASS subtitles to WebVTT without translating them, and
 *   players show them as written. Cues left with no text are dropped.
 * - A file a provider decoded with the wrong code page is restored; see
 *   {@link MisreadFile.repair}.
 * - A cue with the same timing, settings, and text as an earlier one is
 *   dropped: ASS draws a sign as stacked layers, such as a shadow under its
 *   text, which become copies of one cue. One shown again right as it ends,
 *   as an animated sign is, is joined to it instead of flickering.
 * - A sign whose words the dialogue shown with it says is dropped, such as a
 *   skill name on screen while a character announces it.
 * - Every other sign without a position of its own goes to the top, so it
 *   never stacks onto dialogue at the bottom.
 */
export const cleanWebVtt = (content: string) => {
	/** A cue block's timing line, through its line break, and the text after it. */
	const cueText = /^(?<head>[^\n]*-->[^\n]*\n)(?<text>[\s\S]*)$/mu;

	/** How far apart two showings of the same cue may be to count as one, in seconds. */
	const flickerGap = 0.05;

	/**
	 * The share of a sign's words that dialogue shown with it must say for the
	 * sign to repeat it. Below this the sign carries something of its own.
	 */
	const repeatedShare = 0.8;

	const seen = new Set<string>();
	const shown = new Map<string, CleanBlock>();
	const blocks: CleanBlock[] = [];

	for (const block of splitBlocks(MisreadFile.repair(content))) {
		const timing = readTiming(block);

		if (!timing) {
			blocks.push({
				block,
				cue: null,
			});
			continue;
		}

		const lines = block.replaceAll("\r\n", "\n");
		const match = cueText.exec(lines);
		const text = new CueText(match?.groups?.text ?? "").clean;

		if (!match || !text) {
			continue;
		}

		const copy = `${match.groups?.head}${text}`;

		if (seen.has(copy)) {
			continue;
		}

		seen.add(copy);

		const cleaned = new CueText(text);
		const key = `${timing.settings}\n${cleaned.plain}`;
		const earlier = shown.get(key);
		const shownAgain = earlier?.cue && Math.abs(timing.start - earlier.cue.end) <= flickerGap;

		if (earlier?.cue && shownAgain) {
			earlier.cue.end = Math.max(earlier.cue.end, timing.end);
			earlier.block = writeTiming(earlier.block, earlier.cue.start, earlier.cue.end);
			continue;
		}

		const kept: CleanBlock = {
			block: `${lines.slice(0, match.index)}${match.groups?.head}${text}`,
			cue: {
				end: timing.end,
				settings: timing.settings,
				start: timing.start,
				text: cleaned,
			},
		};

		shown.set(key, kept);
		blocks.push(kept);
	}

	const dialogue = blocks.flatMap(({ cue }) => {
		if (cue && !cue.text.sign) {
			return [cue];
		}

		return [];
	});

	return blocks
		.flatMap(({ block, cue }) => {
			if (!cue?.text.sign) {
				return [block];
			}

			// A sign that only repeats what dialogue shown at the same time says, as
			// when a character reads it out: "Magicules" on screen while the line is
			// "Magicules?".
			const { words } = cue.text;

			if (words.length > 0) {
				const said = new Set(
					dialogue
						.filter((line) => line.start < cue.end && line.end > cue.start)
						.flatMap((line) => line.text.words),
				);

				const repeated = words.filter((candidate) => said.has(candidate)).length;

				if (repeated / words.length >= repeatedShare) {
					return [];
				}
			}

			if (/(?:^|\s)line:/u.test(cue.settings)) {
				return [block];
			}

			return [block.replace(timingLine, "$& line:0")];
		})
		.join("\n\n");
};

/**
 * A WebVTT file whose dialogue cues are timed for reading, measured against
 * the track's own pauses:
 *
 * - A cue shown shorter than its text takes to read at 17 characters per
 *   second is held on into the pause after it, up to 1.5 seconds longer and
 *   never into the next line.
 * - A cue still shown when the next line starts ends there, once it has been
 *   up long enough to read, so the two do not stack and jump. Lines spoken at
 *   once, or the next too soon to read this one, keep overlapping.
 *
 * Signs keep their timing, since they belong to what is on screen.
 *
 * Run it on the final timeline, after any retiming, so it measures the pauses
 * the viewer sees.
 */
export const paceWebVtt = (content: string) => {
	/**
	 * How fast viewers read, in characters per second, spaces included: Netflix's
	 * limit for most languages.
	 */
	const readingSpeed = 17;

	/** The shortest a line should be shown, Netflix's minimum, in seconds. */
	const minimumDuration = 5 / 6;

	/** How long a line may stay after it was meant to end, in seconds. */
	const lingerLimit = 1.5;

	/** The pause left before the next line, two frames at 24 fps, in seconds. */
	const lineGap = 2 / 24;

	const cues = splitBlocks(content).map((block) => ({
		block,
		// The cue's text follows its timing line.
		text: new CueText(block.slice((timingLine.exec(block)?.[0].length ?? 0) + 1)),
		timing: readTiming(block),
	}));

	const starts = cues
		.flatMap(({ text, timing }) => {
			if (timing && !text.sign) {
				return [timing.start];
			}

			return [];
		})
		.toSorted((left, right) => left - right);

	return cues
		.map(({ block, text, timing }) => {
			if (!timing || text.sign) {
				return block;
			}

			const characters = text.plain.replaceAll(/\s+/gu, " ").trim().length;
			const needed = Math.max(minimumDuration, characters / readingSpeed);
			const next = starts.find((start) => start > timing.start) ?? Number.POSITIVE_INFINITY;
			const readBeforeNext = next < timing.end && next - timing.start >= needed;

			if (readBeforeNext) {
				return writeTiming(block, timing.start, next);
			}

			if (timing.end - timing.start >= needed) {
				return block;
			}

			const end = Math.min(timing.start + needed, timing.end + lingerLimit, next - lineGap);

			if (end > timing.end) {
				return writeTiming(block, timing.start, end);
			}

			return block;
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
