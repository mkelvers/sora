/** One cue of a WebVTT file, with its text stripped of markup. */
export interface Cue {
	start: number;
	end: number;
	text: string;
}

const timing = /^(\S+)\s+-->\s+(\S+)(.*)$/m;

/**
 * Seconds in a WebVTT timestamp, `hh:mm:ss.ttt` or `mm:ss.ttt`, or `null` when
 * it is neither.
 */
export function parseTimestamp(value: string) {
	const parts = /^(?:(\d+):)?(\d{2}):(\d{2})\.(\d{3})$/.exec(value);
	if (!parts) {
		return null;
	}

	const [, hours = "0", minutes, seconds, milliseconds] = parts;
	return (
		Number(hours) * 3_600 + Number(minutes) * 60 + Number(seconds) + Number(milliseconds) / 1_000
	);
}

export function formatTimestamp(seconds: number) {
	const milliseconds = Math.round(seconds * 1_000);
	const pad = (value: number, length = 2) => String(value).padStart(length, "0");
	return `${pad(Math.floor(milliseconds / 3_600_000))}:${pad(Math.floor(milliseconds / 60_000) % 60)}:${pad(Math.floor(milliseconds / 1_000) % 60)}.${pad(milliseconds % 1_000, 3)}`;
}

/** The blocks of a WebVTT file, separated by blank lines. */
export function splitBlocks(content: string) {
	return content.split(/\r?\n\r?\n/);
}

/**
 * The start and end of a block's cue timing line, in seconds, and what
 * follows it on that line, or `null` when the block is no cue.
 */
export function readTiming(block: string) {
	const match = timing.exec(block);
	const start = match && parseTimestamp(match[1]!);
	const end = match && parseTimestamp(match[2]!);
	if (!match || start === null || end === null) {
		return null;
	}

	return {
		start,
		end,
		settings: match[3]!,
	};
}

/** Replaces the timing of a cue block, keeping its identifier, settings, and text. */
export function writeTiming(block: string, start: number, end: number) {
	const settings = timing.exec(block)?.[3] ?? "";
	return block.replace(timing, `${formatTimestamp(start)} --> ${formatTimestamp(end)}${settings}`);
}

/** The cues of a WebVTT file in file order, with markup, line breaks, and empty cues removed. */
export function readCues(content: string) {
	const cues: Cue[] = [];
	for (const block of splitBlocks(content)) {
		const cue = readTiming(block);
		if (!cue) {
			continue;
		}

		const lines = block.split(/\r?\n/);
		const text = lines
			.slice(lines.findIndex((line) => line.includes("-->")) + 1)
			.join(" ")
			.replace(/<[^>]*>|\{\\[^}]*\}/g, "")
			.replace(/\s+/g, " ")
			.trim();
		if (text) {
			cues.push({
				start: cue.start,
				end: cue.end,
				text,
			});
		}
	}

	return cues;
}
