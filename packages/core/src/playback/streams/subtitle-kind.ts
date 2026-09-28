/**
 * What a subtitle track carries.
 *
 * - `dialogue`: what the characters say.
 * - `signs`: only text shown on screen, such as titles, signs, and credits.
 * - `captions`: dialogue and descriptions of sound for viewers who cannot
 *   hear it, such as `[door creaks]` and music notes.
 */
export type SubtitleKind = "dialogue" | "signs" | "captions";

/** A track shorter than this cannot be told apart by how often it speaks. */
const minimumMinutes = 3;

/** Signs are a handful of cues per episode, dialogue several per minute. */
const signsMaximumCues = 60;
const signsMaximumRate = 1.5;
const dialogueMinimumRate = 4;

/** Cues that only describe sound make a track captions; a few stray ones do not. */
const captionsMinimumShare = 0.08;
const dialogueMaximumShare = 0.02;

const soundCue = /^(?:\s*(?:[[(（【][^\])）】]*[\])）】]|[♪♫♬🎵]+)\s*)+$/u;

export interface SubtitleStats {
	cues: number;
	minutes: number;
	/** Cues that only describe sound or hold music notes, as a share of all cues. */
	soundShare: number;
}

/** Reads the cues of a WebVTT file, or `null` when there are too few to judge. */
export function subtitleStats(content: string): SubtitleStats | null {
	let cues = 0;
	let sound = 0;
	let end = 0;

	for (const block of content.split(/\r?\n\r?\n/)) {
		const lines = block.split(/\r?\n/);
		const timing = lines.findIndex((line) => line.includes("-->"));
		if (timing < 0) {
			continue;
		}

		const stamp = /-->\s*(?:(\d+):)?(\d{1,2}):(\d{2})\.(\d{3})/.exec(lines[timing]!);
		if (stamp) {
			const [, hours = "0", minutes, seconds, milliseconds] = stamp;
			end = Math.max(
				end,
				Number(hours) * 3_600 +
					Number(minutes) * 60 +
					Number(seconds) +
					Number(milliseconds) / 1_000,
			);
		}

		const text = lines
			.slice(timing + 1)
			.join(" ")
			.replace(/<[^>]*>|\{\\[^}]*\}/g, "")
			.trim();
		if (!text) {
			continue;
		}

		cues += 1;
		if (soundCue.test(text)) {
			sound += 1;
		}
	}

	if (cues === 0 || end / 60 < minimumMinutes) {
		return null;
	}

	return {
		cues,
		minutes: end / 60,
		soundShare: sound / cues,
	};
}

/**
 * Tells what a WebVTT track carries from its cues alone, since providers do
 * not say.
 *
 * Only what is clear is answered: sound descriptions mark captions, a few
 * cues over a whole episode mark signs, and steady speech without sound
 * descriptions marks dialogue. Anything in between, such as signs and songs
 * together, is `null` rather than a guess.
 */
export function classifySubtitle(content: string): SubtitleKind | null {
	const stats = subtitleStats(content);
	if (!stats) {
		return null;
	}

	const rate = stats.cues / stats.minutes;
	if (stats.soundShare >= captionsMinimumShare) {
		return "captions";
	}
	if (stats.soundShare === 0 && stats.cues <= signsMaximumCues && rate <= signsMaximumRate) {
		return "signs";
	}
	if (stats.soundShare <= dialogueMaximumShare && rate >= dialogueMinimumRate) {
		return "dialogue";
	}

	return null;
}

const captionsLabel = /closed[- ]captions?|\bcc\b|\bsdh\b|hard of hearing|hearing[- ]impaired/i;
const signsLabel = /\bsigns?\b|\bforced\b|on-screen/i;

/**
 * What a track carries, from the name its provider gave it and its cues.
 *
 * A name that says so, such as `English Signs` or `English Closed Captions`,
 * decides. The cues confirm it: a track whose cues clearly say something else
 * is `null`, not either. Without such a name the cues decide alone.
 *
 * @param content - The WebVTT file, or `null` when it could not be read.
 */
export function subtitleKind(label: string, content: string | null): SubtitleKind | null {
	const measured = content === null ? null : classifySubtitle(content);
	const named = captionsLabel.test(label) ? "captions" : signsLabel.test(label) ? "signs" : null;

	if (named === null) {
		return measured;
	}

	return measured === null || measured === named ? named : null;
}
