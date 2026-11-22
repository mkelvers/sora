import { attempt, defined } from "@sora/shared";

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
 * The legacy code pages providers have decoded UTF-8 subtitles with, turning
 * "—" into "вЂ”" or "â€”".
 */
const codePages = ["windows-1251", "windows-1252"] as const;

const letter = /\p{L}/u;

/** A character UTF-8 writes in three bytes or more, from U+0800 on. */
const wideCharacter = /[\u0800-\u{10FFFF}]/u;

/**
 * Decodes UTF-8 strictly, and keeps a zero-width no-break space where it
 * stands instead of dropping it as a byte order mark.
 */
const utf8 = new TextDecoder("utf-8", {
	fatal: true,
	ignoreBOM: true,
});

/** How a code page reads UTF-8. */
interface Misreading {
	/**
	 * UTF-8 sequences in a row as the code page reads them, each a lead byte
	 * and its continuation bytes, unless the row ends in a cut-off one.
	 */
	run: RegExp;
	/**
	 * Sequences ending in one whose continuation bytes were cut off at the end
	 * of a line, as when a provider shortened a line by bytes, not characters.
	 */
	cut: RegExp;
	/** Any letter the code page reads from a byte outside ASCII, such as Cyrillic in Windows-1251. */
	letter: RegExp;
	/** The byte behind each character the code page reads from outside ASCII. */
	bytes: Map<string, number>;
}

/**
 * Each code page's reading of UTF-8, derived from the decoder itself, so no
 * character is listed by hand.
 */
const misreadings = codePages.map((codePage): Misreading => {
	const decoder = new TextDecoder(codePage);
	const characters = (from: number, to: number) => {
		const range = Uint8Array.from({ length: to - from + 1 }, (_, offset) => from + offset);
		return decoder.decode(range);
	};
	const bytes = new Map<string, number>();
	for (const byte of Uint8Array.from({ length: 128 }, (_, offset) => 0x80 + offset)) {
		bytes.set(decoder.decode(Uint8Array.of(byte)), byte);
	}
	const letters = [...characters(0x80, 0xff)].filter((character) => letter.test(character));

	const continuation = `[${characters(0x80, 0xbf)}]`;
	const twoBytes = `[${characters(0xc2, 0xdf)}]`;
	const threeBytes = `[${characters(0xe0, 0xef)}]`;
	const fourBytes = `[${characters(0xf0, 0xf4)}]`;
	const sequence = `(?:${twoBytes}${continuation}|${threeBytes}${continuation}{2}|${fourBytes}${continuation}{3})`;
	const partial = `(?:${twoBytes}|${threeBytes}${continuation}?|${fourBytes}${continuation}{0,2})`;
	const cut = `${sequence}*${partial}(?=\r?\n|$)`;
	return {
		bytes,
		cut: new RegExp(cut, "gu"),
		letter: new RegExp(`[${letters.join("")}]`, "u"),
		run: new RegExp(`${sequence}+(?!${sequence}|${cut})`, "gu"),
	};
});

/** The text a run {@link Misreading.run} matched stands for, or `null` when its bytes are not UTF-8. */
const decode = (misread: string, misreading: Misreading) => {
	const encoded = Uint8Array.from(misread, (character) => defined(misreading.bytes.get(character)));
	const { data, error } = attempt(() => utf8.decode(encoded), TypeError);
	if (error) {
		return null;
	}
	return data;
};

/**
 * A file with one layer of misreading undone, or as it is when it shows
 * none.
 *
 * A file counts as misread when:
 *
 * - Every letter the code page reads from outside ASCII belongs to a sequence
 *   that decodes as UTF-8, or to one cut off at the end of a line. Text truly
 *   written in the code page's languages, such as Russian, has letters
 *   outside any such sequence, and is left as it is, even where a few of its
 *   characters happen to look like one. Punctuation does not count, since a
 *   misread file can also hold some written correctly.
 * - It holds more than one such sequence, or one of three bytes or more, such
 *   as "—" or "’". A single letter and the punctuation after it, such as
 *   "É…", read as a two-byte sequence by chance as often as by misreading,
 *   and are left alone rather than risk changing correct text.
 *
 * Cut-off sequences cannot be restored and are left as they are.
 */
const unwrap = (content: string) => {
	for (const misreading of misreadings) {
		let wide = false;
		let found = 0;
		const decodable = content.replaceAll(misreading.run, (run) => {
			const decoded = decode(run, misreading);
			if (decoded === null) {
				return run;
			}
			wide ||= wideCharacter.test(decoded);
			found += 1;
			return "";
		});
		const leftover = decodable.replaceAll(misreading.cut, "");
		const misread = (wide || found > 1) && !misreading.letter.test(leftover);
		if (misread) {
			return content.replaceAll(misreading.run, (run) => decode(run, misreading) ?? run);
		}
	}
	return content;
};

/**
 * A subtitle file with its text restored when a provider decoded the UTF-8
 * file with a legacy code page, as on some of MegaPlay's tracks. A file
 * misread more than once is restored one layer at a time, each layer judged
 * on its own, until none is left.
 */
const repair = (content: string) => {
	let repaired = content;
	let layer = unwrap(repaired);
	while (layer !== repaired) {
		repaired = layer;
		layer = unwrap(repaired);
	}
	return repaired;
};

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

const markup = /<[^>]*>/gu;
const boldTag = /<\/?b>/gu;
const word = /[\p{L}\p{N}]+/gu;

/** Cue text without markup, which is what a viewer reads. */
const plainText = (text: string) => text.replaceAll(markup, "");

/**
 * Whether cue text is bold throughout. Tracks converted from Crunchyroll's
 * subtitles mark the translation of text shown on screen, such as signs,
 * titles, and skill names, this way, and dialogue never. Conversions leave
 * bold unclosed or nested at times, which still counts.
 */
const isSign = (text: string) => {
	if (!text.startsWith("<b>")) {
		return false;
	}

	let depth = 0;
	let after = 0;
	for (const tag of text.matchAll(boldTag)) {
		if (depth === 0 && plainText(text.slice(after, tag.index)).trim()) {
			return false;
		}
		depth = Math.max(0, depth + (tag[0] === "<b>" ? 1 : -1));
		after = tag.index + tag[0].length;
	}
	return depth > 0 || !plainText(text.slice(after)).trim();
};

/** The words of cue text, lowercased, without markup or punctuation. */
const wordsOf = (text: string) => plainText(text).toLowerCase().match(word) ?? [];

/**
 * The share of a sign's words that dialogue shown with it must say for the
 * sign to repeat it. Below this the sign carries something of its own.
 */
const repeatedShare = 0.8;

/** How far apart two showings of the same cue may be to count as one, in seconds. */
const flickerGap = 0.05;

/** A cue's timing line, without its line break. */
const timingLine = /^[^\n]*-->[^\n]*/mu;

/** A position setting on a cue's timing line. */
const lineSetting = /(?:^|\s)line:/u;

/** A block of a WebVTT file, with its cue when it is one. */
interface CleanBlock {
	block: string;
	cue: {
		start: number;
		end: number;
		settings: string;
		text: string;
		sign: boolean;
	} | null;
}

/**
 * Whether a sign only repeats what dialogue shown at the same time says, as
 * when a character reads it out: "Magicules" on screen while the line is
 * "Magicules?".
 */
const repeatsDialogue = (
	sign: NonNullable<CleanBlock["cue"]>,
	dialogue: NonNullable<CleanBlock["cue"]>[],
) => {
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
 * A WebVTT file made easier to read: ASS escapes in cue text cleaned up, cues
 * that only repeat another dropped, and signs moved to the top of the picture.
 *
 * - Providers convert ASS subtitles to WebVTT without translating them, and
 *   players show them as written. Cues left with no text are dropped.
 * - A file a provider decoded with the wrong code page is restored; see
 *   {@link repair}.
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
	const seen = new Set<string>();
	const shown = new Map<string, CleanBlock>();
	const blocks: CleanBlock[] = [];
	for (const block of splitBlocks(repair(content))) {
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
		const text = cleanText(match?.groups?.text ?? "");
		if (!match || !text) {
			continue;
		}

		const copy = `${match.groups?.head}${text}`;
		if (seen.has(copy)) {
			continue;
		}
		seen.add(copy);

		const key = `${timing.settings}\n${plainText(text)}`;
		const earlier = shown.get(key);
		if (earlier?.cue && Math.abs(timing.start - earlier.cue.end) <= flickerGap) {
			earlier.cue.end = Math.max(earlier.cue.end, timing.end);
			earlier.block = writeTiming(earlier.block, earlier.cue.start, earlier.cue.end);
			continue;
		}

		const kept: CleanBlock = {
			block: `${lines.slice(0, match.index)}${match.groups?.head}${text}`,
			cue: {
				end: timing.end,
				settings: timing.settings,
				sign: isSign(text),
				start: timing.start,
				text,
			},
		};
		shown.set(key, kept);
		blocks.push(kept);
	}

	const dialogue = blocks.flatMap(({ cue }) => (cue && !cue.sign ? [cue] : []));
	return blocks
		.flatMap(({ block, cue }) => {
			if (!cue?.sign) {
				return [block];
			}
			if (repeatsDialogue(cue, dialogue)) {
				return [];
			}
			return [lineSetting.test(cue.settings) ? block : block.replace(timingLine, "$& line:0")];
		})
		.join("\n\n");
};

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

/** The text of a cue block, after its timing line. */
const blockText = (block: string) => block.slice((timingLine.exec(block)?.[0].length ?? 0) + 1);

/**
 * A WebVTT file whose dialogue cues are timed for reading, measured against
 * the track's own pauses:
 *
 * - A cue shown shorter than its text takes to read at {@link readingSpeed}
 *   is held on into the pause after it, up to {@link lingerLimit} longer and
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
	const blocks = splitBlocks(content);
	const starts = blocks
		.flatMap((block) => {
			const timing = readTiming(block);
			return timing && !isSign(blockText(block)) ? [timing.start] : [];
		})
		.toSorted((left, right) => left - right);

	return blocks
		.map((block) => {
			const timing = readTiming(block);
			const text = blockText(block);
			if (!timing || isSign(text)) {
				return block;
			}

			const characters = plainText(text).replaceAll(/\s+/gu, " ").trim().length;
			const needed = Math.max(minimumDuration, characters / readingSpeed);
			const next = starts.find((start) => start > timing.start) ?? Number.POSITIVE_INFINITY;
			if (next < timing.end && next - timing.start >= needed) {
				return writeTiming(block, timing.start, next);
			}
			if (timing.end - timing.start >= needed) {
				return block;
			}

			const end = Math.min(timing.start + needed, timing.end + lingerLimit, next - lineGap);
			return end > timing.end ? writeTiming(block, timing.start, end) : block;
		})
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
