import { defined } from "@sora/shared";
/** One cue of a WebVTT file, with its text stripped of markup. */
export interface Cue {
	start: number;
	end: number;
	text: string;
}

const timing = /^(?<start>\S+)\s+-->\s+(?<end>\S+)(?<settings>.*)$/mu;

/**
 * Seconds in a WebVTT timestamp, `hh:mm:ss.ttt` or `mm:ss.ttt`, or `null` when
 * it is neither.
 */
export const parseTimestamp = (value: string) => {
	const parts =
		/^(?:(?<hours>\d+):)?(?<minutes>\d{2}):(?<seconds>\d{2})\.(?<milliseconds>\d{3})$/u.exec(value);
	if (!parts) {
		return null;
	}

	const [, hours = "0", minutes, seconds, milliseconds] = parts;
	return (
		Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1000
	);
};

const pad = (value: number, length = 2) => String(value).padStart(length, "0");

export const formatTimestamp = (seconds: number) => {
	const milliseconds = Math.round(seconds * 1000);
	return `${pad(Math.floor(milliseconds / 3_600_000))}:${pad(Math.floor(milliseconds / 60_000) % 60)}:${pad(Math.floor(milliseconds / 1000) % 60)}.${pad(milliseconds % 1000, 3)}`;
};

/** The blocks of a WebVTT file, separated by blank lines. */
export const splitBlocks = (content: string) => content.split(/\r?\n\r?\n/u);

/**
 * The start and end of a block's cue timing line, in seconds, and what
 * follows it on that line, or `null` when the block is no cue.
 */
export const readTiming = (block: string) => {
	const match = timing.exec(block);
	const start = match && parseTimestamp(defined(match[1]));
	const end = match && parseTimestamp(defined(match[2]));
	if (!match || start === null || end === null) {
		return null;
	}

	return {
		end,
		settings: defined(match[3]),
		start,
	};
};

/** Replaces the timing of a cue block, keeping its identifier, settings, and text. */
export const writeTiming = (block: string, start: number, end: number) => {
	const settings = timing.exec(block)?.[3] ?? "";
	return block.replace(timing, `${formatTimestamp(start)} --> ${formatTimestamp(end)}${settings}`);
};

/** The cues of a WebVTT file in file order, with markup, line breaks, and empty cues removed. */
export const readCues = (content: string) => {
	const cues: Cue[] = [];
	for (const block of splitBlocks(content)) {
		const cue = readTiming(block);
		if (!cue) {
			continue;
		}

		const lines = block.split(/\r?\n/u);
		const text = lines
			.slice(lines.findIndex((line) => line.includes("-->")) + 1)
			.join(" ")
			.replaceAll(/<[^>]*>|\{\\[^}]*\}/gu, "")
			.replaceAll(/\s+/gu, " ")
			.trim();
		if (text) {
			cues.push({
				end: cue.end,
				start: cue.start,
				text,
			});
		}
	}

	return cues;
};
