import { defined } from "@sora/shared";

import { bestPath, shiftTime } from "../streams/align";
import type { TimelineShift } from "../streams/align";
import type { Cue } from "./vtt";

/** One word of speech found in the dub's audio, in seconds on the dub's timeline. */
export interface SpokenWord {
	text: string;
	start: number;
	end: number;
}

/**
 * Where one cue of the sub's subtitles goes on the dub's timeline, so it
 * shows while the dub says its line. `start` and `end` identify the cue on
 * the sub's timeline.
 */
export interface CueAnchor {
	start: number;
	end: number;
	movedStart: number;
	movedEnd: number;
}

export interface Refinement {
	/** How the sub's timeline maps onto the dub's for cues without an anchor, such as signs. */
	shifts: TimelineShift[];
	anchors: CueAnchor[];
}

/** How far before a line is spoken its cue appears, in seconds. */
const lead = 0.15;
/** How long after a line is spoken its cue stays, in seconds. */
const tail = 0.25;
/**
 * How long a cue shows at least, as characters per second of reading time,
 * with an absolute floor; a cue is never kept longer than it was.
 */
const readingRate = 20;
const minimumShowSeconds = 1;

/**
 * Sub cues come on before speech does, by 0 to 0.3 seconds in the episodes
 * measured, so an offset found from where speech starts is about this much
 * later than the picture's.
 */
const typicalLag = 0.1;
/** A picture shift further than this from what the speech says is not trusted. */
const pictureTolerance = 1.5;
/** A cue is placed by time when this much of the shorter of it and the speech overlaps. */
const minimumOverlap = 0.5;
/** Speech is taken as a cue's only if it starts this near where the cue should. */
const nearRunSeconds = 1;
/** Speech a placed cue covers this much of is already said. */
const claimedShare = 0.3;
/** Within this far of where a cue should be, one shared word can match it. */
const nearSeconds = 1.2;
/** Farther than that, the words shared must weigh this much, such as two that carry meaning. */
const minimumFarWeight = 1.5;
/** A pause this long in speech ends a line, so a cue never spans one. */
const pauseSeconds = 1.5;
/** How far from where a cue should be, once offsets are known, speech may match it. */
const searchSeconds = 3.5;

/** Matching offsets need this many cues behind them. */
const minimumVotes = 4;
const maximumOffsets = 16;
const offsetBucketSeconds = 0.5;
/** A cue votes for an offset when its best phrase scores at least this well. */
const voteScore = 0.5;
const switchPenalty = 4;
/** Fewer matched cues than this and the dub's speech is not the sub's script. */
const minimumAnchors = 12;
const minimumAnchorShare = 0.1;

/** Cues that follow a matched cue and may be matched without a word of it in between. */
const lookback = 6;
const candidatesPerCue = 8;
const minimumDice = 0.3;
const minimumScore = 0.15;
const timePenalty = 0.3;

const stopWords = new Set(
	`a an the and or but so if of to in on at by for with from as is are was were be been am do does did
	i you he she it we they me him her us them my your his its our their this that these those there
	oh well just not no yes yeah hey what who how why when where which will would can could shall should
	have has had get got go going gonna then than too very really all some any`.split(/\s+/u),
);

interface Token {
	stem: string;
	weight: number;
}

const stemOf = (word: string) => {
	if (word.length > 5 && word.endsWith("ing")) {
		return word.slice(0, -3);
	}
	if (word.length > 4 && word.endsWith("ed")) {
		return word.slice(0, -2);
	}
	if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) {
		return word.slice(0, -1);
	}
	return word;
};

/** Words of a line, without sound descriptions, markup, or punctuation, reduced to their stems. */
const tokenize = (text: string): Token[] => {
	const spokenText = text
		.toLowerCase()
		.replaceAll(/<[^>]*>|\{\\[^}]*\}|\[[^\]]*\]|\([^)]*\)|♪[^♪]*♪?/gu, " ")
		.replaceAll(/[’‘]/gu, "'");
	return (spokenText.match(/[a-z0-9]+(?:'[a-z]+)*/gu) ?? []).map((word) => {
		const bare = word
			.replace(/'(?:s|d|ll|re|ve|m)$/u, "")
			.replace(/n't$/u, "nt")
			.replaceAll("'", "");
		return {
			stem: stemOf(bare),
			weight: stopWords.has(bare) ? 0.25 : 1,
		};
	});
};

interface Phrase {
	first: number;
	last: number;
}

/** Runs of words with no pause or sentence end between them, as indexes into `words`. */
const phrasesOf = (words: SpokenWord[]) => {
	const phrases: Phrase[] = [];
	let first = 0;
	for (let index = 0; index < words.length; index += 1) {
		const next = words[index + 1];
		const ends =
			!next ||
			next.start - defined(words[index]).end > 0.35 ||
			/[.?!…]["')\]]?$/u.test(defined(words[index]).text.trim()) ||
			index - first >= 24;
		if (ends) {
			phrases.push({
				first,
				last: index,
			});
			first = index + 1;
		}
	}
	return phrases;
};

const weightOf = (tokens: Token[]) => tokens.reduce((sum, token) => sum + token.weight, 0);

const editDistance = (left: string, right: string) => {
	let row = Array.from({ length: right.length + 1 }, (_, index) => index);
	for (let i = 1; i <= left.length; i += 1) {
		const next = [i];
		for (let j = 1; j <= right.length; j += 1) {
			next[j] = Math.min(
				defined(row[j]) + 1,
				defined(next[j - 1]) + 1,
				defined(row[j - 1]) + (left[i - 1] === right[j - 1] ? 0 : 1),
			);
		}
		row = next;
	}
	return defined(row[right.length]);
};

/** How many letters of a word of this length may be heard wrong. */
const typoAllowance = (length: number) => {
	if (length >= 8) {
		return 2;
	}
	return length >= 5 ? 1 : 0;
};

/** Whether two stems are one word, allowing for a mishearing in a long one. */
const same = (left: string, right: string) => {
	if (left === right) {
		return true;
	}

	const shortest = Math.min(left.length, right.length);
	const allowed = typoAllowance(shortest);
	return (
		allowed > 0 &&
		Math.abs(left.length - right.length) <= allowed &&
		editDistance(left, right) <= allowed
	);
};

/** The weight of the words two sets have in common. */
const sharedWeight = (left: Token[], right: Token[]) => {
	const free = right.map(() => true);
	let shared = 0;
	for (const token of left) {
		const match = right.findIndex((other, index) => free[index] && same(token.stem, other.stem));
		if (match !== -1) {
			free[match] = false;
			shared += Math.min(token.weight, defined(right[match]).weight);
		}
	}
	return shared;
};

/**
 * How alike two sets of words are, 0 to 1: twice the weight of the words
 * they share over the weight of both. Little words count for less.
 */
const dice = (left: Token[], right: Token[]) =>
	(2 * sharedWeight(left, right)) / (weightOf(left) + weightOf(right) || 1);

const median = (values: number[]) => {
	const sorted = values.toSorted((a, b) => a - b);
	return defined(sorted[Math.floor(sorted.length / 2)]);
};

/**
 * Offsets between the timelines that many cues agree on, as the offset
 * after each cue's start. Found from cue and phrase pairs that say nearly
 * the same, wherever on the dub's timeline the phrase is, and followed along
 * the episode so an offset can change where the dub cuts or adds footage.
 */
const voteOffsets = (
	cues: Cue[],
	cueTokens: Token[][],
	words: SpokenWord[],
	spoken: (Token | null)[],
): TimelineShift[] | null => {
	const phrases = phrasesOf(words);
	const phraseTokens = phrases.map((phrase) =>
		spoken.slice(phrase.first, phrase.last + 1).flatMap((token) => (token ? [token] : [])),
	);

	const votes = cues.map((cue, index) => {
		const tokens = defined(cueTokens[index]);
		if (weightOf(tokens) < 1.5) {
			return [];
		}

		return phrases
			.map((phrase, other) => ({
				offset: defined(words[phrase.first]).start - cue.start,
				score: dice(tokens, defined(phraseTokens[other])),
			}))
			.filter((vote) => vote.score >= voteScore)
			.toSorted((a, b) => b.score - a.score)
			.slice(0, 2)
			.map((vote) => vote.offset);
	});

	const buckets = new Map<number, number>();
	for (const cueVotes of votes) {
		for (const offset of new Set(
			cueVotes.map((value) => Math.round(value / offsetBucketSeconds)),
		)) {
			buckets.set(offset, (buckets.get(offset) ?? 0) + 1);
		}
	}

	const picked: number[] = [];
	for (const [bucket] of [...buckets]
		.map(
			([key, count]) =>
				[key, count + (buckets.get(key - 1) ?? 0) + (buckets.get(key + 1) ?? 0)] as const,
		)
		.filter(([, count]) => count >= minimumVotes)
		.toSorted((a, b) => b[1] - a[1])) {
		if (picked.length === maximumOffsets) {
			break;
		}
		if (picked.every((other) => Math.abs(other - bucket) > 2)) {
			picked.push(bucket);
		}
	}

	const offsets = picked.flatMap((bucket) => {
		const rough = bucket * offsetBucketSeconds;
		const near = votes.flat().filter((offset) => Math.abs(offset - rough) <= 1);
		return near.length > 0 ? [median(near)] : [];
	});
	if (offsets.length === 0) {
		return null;
	}

	const matches = votes.map((cueVotes) =>
		offsets.map((offset) => cueVotes.some((vote) => Math.abs(vote - offset) <= 1)),
	);
	const path = bestPath(matches, switchPenalty);
	if (path.filter((choice, index) => matches[index]?.[choice]).length < minimumVotes) {
		return null;
	}

	const shifts: TimelineShift[] = [];
	path.forEach((choice, index) => {
		const offset = defined(offsets[choice]);
		if (shifts.at(-1)?.offset !== offset) {
			shifts.push({
				from: index === 0 ? 0 : defined(cues[index]).start,
				offset,
			});
		}
	});
	return shifts;
};

/** The index of the first word starting at or after `time`. */
const firstStartingAfter = (words: SpokenWord[], time: number) => {
	let low = 0;
	let high = words.length;
	while (low < high) {
		const middle = Math.floor((low + high) / 2);
		if (defined(words[middle]).start < time) {
			low = middle + 1;
		} else {
			high = middle;
		}
	}
	return low;
};

interface Pick {
	cue: number;
	first: number;
	last: number;
}

interface Candidate extends Pick {
	score: number;
}

/**
 * The runs of spoken words near where a cue should be, best first, that
 * share enough words with it.
 */
const candidatesFor = (
	cue: Cue,
	index: number,
	tokens: Token[],
	words: SpokenWord[],
	spoken: (Token | null)[],
	offset: number,
) => {
	const weight = weightOf(tokens);
	if (weight < 0.5) {
		return [];
	}

	const expected = cue.start + offset;
	const longest = Math.min(40, Math.ceil(tokens.length * 1.8) + 3);
	const found: Candidate[] = [];
	for (
		let first = firstStartingAfter(words, expected - searchSeconds);
		first < words.length;
		first += 1
	) {
		const { start } = defined(words[first]);
		if (start > expected + searchSeconds) {
			break;
		}

		const run: Token[] = [];
		for (let last = first; last < Math.min(words.length, first + longest); last += 1) {
			if (
				last > first &&
				defined(words[last]).start - defined(words[last - 1]).end > pauseSeconds
			) {
				break;
			}

			const token = spoken[last];
			if (token) {
				run.push(token);
			}
			const similarity = dice(tokens, run);
			if (similarity < minimumDice) {
				continue;
			}

			// A single shared word is a coincidence unless the run is where the cue should be.
			const distance = Math.abs(start - expected);
			if (distance > nearSeconds && sharedWeight(tokens, run) < minimumFarWeight) {
				continue;
			}

			const score = similarity - timePenalty * Math.min(1, distance / searchSeconds);
			if (score >= minimumScore) {
				found.push({
					cue: index,
					first,
					last,
					score,
				});
			}
		}
	}

	return found.toSorted((a, b) => b.score - a.score).slice(0, candidatesPerCue);
};

/** The offset from the sub's timeline to the dub's at each cue, from `shifts`. */
const offsetAt = (shifts: TimelineShift[], time: number) => shiftTime(shifts, time) - time;

/**
 * The run of spoken words each cue is said in, in order, chosen to share the
 * most words overall: a cue picks from runs near where the offset puts it,
 * and a cue picks only after the cues before it, so lines keep their order.
 * Cues that match nothing well are skipped.
 */
const pickAnchors = (
	cues: Cue[],
	cueTokens: Token[][],
	words: SpokenWord[],
	spoken: (Token | null)[],
	voted: TimelineShift[],
) => {
	const candidates = cues.map((cue, index) =>
		candidatesFor(cue, index, defined(cueTokens[index]), words, spoken, offsetAt(voted, cue.start)),
	);

	const best: { total: number; before: [number, number] | null }[][] = candidates.map((row) =>
		row.map((candidate) => ({
			before: null,
			total: candidate.score,
		})),
	);
	let top: [number, number] | null = null;
	for (let cue = 0; cue < cues.length; cue += 1) {
		for (const [index, candidate] of defined(candidates[cue]).entries()) {
			const entry = defined(defined(best[cue])[index]);
			for (let earlier = Math.max(0, cue - lookback); earlier < cue; earlier += 1) {
				for (const [other, previous] of defined(candidates[earlier]).entries()) {
					const total = defined(defined(best[earlier])[other]).total + candidate.score;
					if (previous.last <= candidate.first && total > entry.total) {
						entry.total = total;
						entry.before = [earlier, other];
					}
				}
			}
			if (!top || entry.total > defined(defined(best[top[0]])[top[1]]).total) {
				top = [cue, index];
			}
		}
	}

	const picked: Pick[] = [];
	for (let at = top; at; at = defined(defined(best[at[0]])[at[1]]).before) {
		picked.unshift(defined(defined(candidates[at[0]])[at[1]]));
	}
	return picked;
};

/** Cues with enough words to tell what they say. */
const speakingCues = (cueTokens: Token[][]) =>
	cueTokens.filter((tokens) => weightOf(tokens) >= 1).length;

/**
 * The offsets for cues without an anchor. The picture's are exact, so they
 * stand wherever the speech agrees with them to within
 * {@link pictureTolerance}; otherwise the speech's offset does, less the
 * lead cues have over speech.
 */
const baseShifts = (picture: TimelineShift[] | null, voted: TimelineShift[]) => {
	const boundaries = [
		...new Set([
			0,
			...voted.map((shift) => shift.from),
			...(picture ?? []).map((shift) => shift.from),
		]),
	].toSorted((a, b) => a - b);

	const shifts: TimelineShift[] = [];
	for (const from of boundaries) {
		const heard = offsetAt(voted, from);
		const seen = picture ? offsetAt(picture, from) : null;
		const offset =
			seen !== null && Math.abs(seen - heard) <= pictureTolerance ? seen : heard - typicalLag;
		if (shifts.at(-1)?.offset !== offset) {
			shifts.push({
				from,
				offset,
			});
		}
	}
	return shifts;
};

/**
 * When a cue shows if its line is the words `first` to `last`: from a
 * little before the first to a little after the last, and no shorter than it
 * takes to read, though never longer than it was.
 */
const showFor = (cue: Cue, index: number, words: SpokenWord[], first: number, last: number) => {
	const movedStart = Math.max(0, defined(words[first]).start - lead);
	const readable = Math.min(
		cue.end - cue.start,
		Math.max(minimumShowSeconds, cue.text.length / readingRate),
	);
	return {
		cue: index,
		movedEnd: Math.max(defined(words[last]).end + tail, movedStart + readable),
		movedStart,
	};
};

interface Placed {
	cue: number;
	movedStart: number;
	movedEnd: number;
}

/**
 * Where each picked cue goes: the start of its first shared word and the end
 * of its last; see {@link showFor}.
 */
const place = (
	cues: Cue[],
	cueTokens: Token[][],
	words: SpokenWord[],
	spoken: (Token | null)[],
	picked: Pick[],
) =>
	picked.map((pick): Placed => {
		const tokens = defined(cueTokens[pick.cue]);
		const shared = (index: number) => {
			const token = spoken[index];
			return !!token && tokens.some((other) => same(other.stem, token.stem));
		};
		let { first } = pick;
		let { last } = pick;
		while (first < last && !shared(first)) {
			first += 1;
		}
		while (last > first && !shared(last)) {
			last -= 1;
		}

		return showFor(defined(cues[pick.cue]), pick.cue, words, first, last);
	});

/**
 * The placed cues as anchors, in cue order, each ending before the next
 * starts so cues placed by different means do not overlap. Cues that show
 * together in the sub, such as a sign over a line of speech, keep doing so.
 */
const tidy = (cues: Cue[], placed: Placed[]) => {
	const anchors: CueAnchor[] = [];
	let before: Placed | null = null;
	for (const next of placed.toSorted((a, b) => a.cue - b.cue)) {
		const previous = anchors.at(-1);
		const together = before && defined(cues[next.cue]).start < defined(cues[before.cue]).end - 0.05;
		if (previous && !together && next.movedStart < previous.movedEnd) {
			previous.movedEnd = Math.max(previous.movedStart + 0.3, next.movedStart - 0.02);
		}
		anchors.push({
			end: defined(cues[next.cue]).end,
			movedEnd: next.movedEnd,
			movedStart: next.movedStart,
			start: defined(cues[next.cue]).start,
		});
		before = next;
	}
	return anchors.toSorted((a, b) => a.start - b.start);
};

const overlapSeconds = (startA: number, endA: number, startB: number, endB: number) =>
	Math.max(0, Math.min(endA, endB) - Math.max(startA, startB));

/**
 * Places cues whose words the dub does not share, such as when its script
 * words a line differently, by when they are said. With the offset known, a
 * cue that lies over a run of speech nothing else claimed is that speech.
 * Cues that share a run, because the sub breaks a sentence up where the dub
 * does not, split it between them by their length.
 */
const placeByTime = (
	cues: Cue[],
	cueTokens: Token[][],
	words: SpokenWord[],
	shifts: TimelineShift[],
	matched: Placed[],
) => {
	const runs = phrasesOf(words).map((run) => ({
		...run,
		end: defined(words[run.last]).end,
		start: defined(words[run.first]).start,
	}));
	const claimedCues = new Set(matched.map((placed) => placed.cue));
	const free = runs.filter(
		(run) =>
			!matched.some(
				(placed) =>
					overlapSeconds(placed.movedStart, placed.movedEnd, run.start, run.end) >
					claimedShare * (run.end - run.start),
			),
	);

	const claims = new Map<(typeof runs)[number], number[]>();
	for (const [index, cue] of cues.entries()) {
		if (claimedCues.has(index) || weightOf(defined(cueTokens[index])) < 0.5) {
			continue;
		}

		const offset = offsetAt(shifts, cue.start) + typicalLag;
		const expected = {
			end: cue.end + offset,
			start: cue.start + offset,
		};
		let best: { run: (typeof runs)[number]; share: number } | null = null;
		for (const run of free) {
			const share =
				overlapSeconds(expected.start, expected.end, run.start, run.end) /
				Math.min(expected.end - expected.start, run.end - run.start);
			if (
				share >= minimumOverlap &&
				Math.abs(run.start - expected.start) <= nearRunSeconds &&
				(!best || share > best.share)
			) {
				best = {
					run,
					share,
				};
			}
		}
		if (best) {
			claims.set(best.run, [...(claims.get(best.run) ?? []), index]);
		}
	}

	return [...claims].flatMap(([run, claiming]) => {
		const count = run.last - run.first + 1;
		const total = claiming.reduce((sum, index) => sum + defined(cues[index]).text.length, 0);
		let passed = 0;
		let { first } = run;
		return claiming.map((index, position) => {
			passed += defined(cues[index]).text.length;
			const last =
				position === claiming.length - 1
					? run.last
					: Math.max(first, run.first + Math.round((passed / total) * count) - 1);
			const placed = showFor(defined(cues[index]), index, words, first, last);
			first = Math.min(run.last, last + 1);
			return placed;
		});
	});
};

/**
 * Moves each cue of the sub's subtitles to when the dub says it.
 *
 * Cue text and the dub's speech come from different scripts, so cues are
 * matched to what is said by the words they share. First, the offset between
 * the timelines is found from cues and phrases that match closely wherever
 * they are, which needs no help from the picture and so also works when the
 * encodes could not be aligned by their segments. Then each cue is matched,
 * in order, to the run of spoken words near where it should be that it
 * shares most words with, and takes that run's start and end. A cue with no
 * speech to match, such as a sign, is left to the offset.
 *
 * @param cues - The sub's English dialogue cues, in order.
 * @param words - Speech found in the dub's audio, in order.
 * @param picture - How the encodes' picture aligns, when it could be told.
 * @returns `null` when too few cues match the speech for the dub to be the
 *   same script.
 */
export const refineCues = (
	cues: Cue[],
	words: SpokenWord[],
	picture: TimelineShift[] | null,
): Refinement | null => {
	const spoken = words.map((word) => tokenize(word.text)[0] ?? null);
	const cueTokens = cues.map((cue) => tokenize(cue.text));

	const voted = voteOffsets(cues, cueTokens, words, spoken);
	if (!voted) {
		return null;
	}

	const picked = pickAnchors(cues, cueTokens, words, spoken, voted);
	if (
		picked.length < minimumAnchors ||
		picked.length < minimumAnchorShare * speakingCues(cueTokens)
	) {
		return null;
	}

	const shifts = baseShifts(picture, voted);
	const matched = place(cues, cueTokens, words, spoken, picked);
	return {
		anchors: tidy(cues, [...matched, ...placeByTime(cues, cueTokens, words, shifts, matched)]),
		shifts,
	};
};
