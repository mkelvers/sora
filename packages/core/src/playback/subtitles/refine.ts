import { defined } from "@sora/shared";

import { bestPath, shiftTime } from "../streams/align";
import type { TimelineShift } from "../streams/align";
import { Line } from "./line";
import type { Token } from "./line";
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

/**
 * Sub cues come on before speech does, by 0 to 0.3 seconds in the episodes
 * measured, so an offset found from where speech starts is about this much
 * later than the picture's.
 */
const typicalLag = 0.1;

/** How far from where a cue should be, once offsets are known, speech may match it. */
const searchSeconds = 3.5;

/** Matching offsets need this many cues behind them. */
const minimumVotes = 4;

const offsetBucketSeconds = 0.5;

interface Phrase {
	first: number;
	last: number;
}

interface Pick {
	cue: number;
	first: number;
	last: number;
}

interface Candidate extends Pick {
	score: number;
}

interface Placed {
	cue: number;
	movedStart: number;
	movedEnd: number;
}

/** The sub's English dialogue cues and the speech found in the dub's audio, matched to one another. */
class Matching {
	readonly #cues: Cue[];
	readonly #words: SpokenWord[];
	readonly #picture: TimelineShift[] | null;
	readonly #spoken: (Token | null)[];
	readonly #lines: Line[];

	constructor(cues: Cue[], words: SpokenWord[], picture: TimelineShift[] | null) {
		this.#cues = cues;
		this.#words = words;
		this.#picture = picture;
		this.#spoken = words.map((word) => new Line(word.text).tokens[0] ?? null);
		this.#lines = cues.map((cue) => new Line(cue.text));
	}

	/** Where each cue goes; see {@link retimeCues}. */
	refine(): Refinement | null {
		/** Fewer matched cues than this and the dub's speech is not the sub's script. */
		const minimumAnchors = 12;

		const voted = this.#vote();

		if (!voted) {
			return null;
		}

		const picked = this.#pick(voted);

		if (picked.length < minimumAnchors) {
			return null;
		}

		const minimumAnchorShare = 0.1;

		/** Cues with enough words to tell what they say. */
		const speaking = this.#lines.filter((line) => line.weight >= 1).length;

		if (picked.length < minimumAnchorShare * speaking) {
			return null;
		}

		const shifts = this.#baseShifts(voted);
		const matched = this.#place(picked);

		return {
			anchors: this.#tidy([...matched, ...this.#placeByTime(shifts, matched)]),
			shifts,
		};
	}

	/** Runs of words with no pause or sentence end between them, as indexes into the words. */
	get #phrases() {
		const words = this.#words;
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
	}

	/**
	 * Offsets between the timelines that many cues agree on, as the offset
	 * after each cue's start. Found from cue and phrase pairs that say nearly
	 * the same, wherever on the dub's timeline the phrase is, and followed along
	 * the episode so an offset can change where the dub cuts or adds footage.
	 */
	#vote(): TimelineShift[] | null {
		/** A cue votes for an offset when its best phrase scores at least this well. */
		const voteScore = 0.5;

		const maximumOffsets = 16;

		const cues = this.#cues;
		const words = this.#words;
		const phrases = this.#phrases;

		const phraseTokens = phrases.map((phrase) =>
			this.#spoken.slice(phrase.first, phrase.last + 1).flatMap((token) => {
				if (token) {
					return [token];
				}

				return [];
			}),
		);

		const votes = cues.map((cue, index) => {
			const line = defined(this.#lines[index]);

			if (line.weight < 1.5) {
				return [];
			}

			return phrases
				.map((phrase, other) => ({
					offset: defined(words[phrase.first]).start - cue.start,
					score: line.dice(defined(phraseTokens[other])),
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
			.values()
			.map(
				([key, count]) =>
					[key, count + (buckets.get(key - 1) ?? 0) + (buckets.get(key + 1) ?? 0)] as const,
			)
			.filter(([, count]) => count >= minimumVotes)
			.toArray()
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

			if (near.length > 0) {
				const sorted = near.toSorted((a, b) => a - b);

				return [defined(sorted[Math.floor(sorted.length / 2)])];
			}

			return [];
		});

		if (offsets.length === 0) {
			return null;
		}

		const matches = votes.map((cueVotes) =>
			offsets.map((offset) => cueVotes.some((vote) => Math.abs(vote - offset) <= 1)),
		);

		const switchPenalty = 4;

		const path = bestPath(matches, switchPenalty);

		if (path.filter((choice, index) => matches[index]?.[choice]).length < minimumVotes) {
			return null;
		}

		const shifts: TimelineShift[] = [];

		for (const [index, choice] of path.entries()) {
			const offset = defined(offsets[choice]);

			if (shifts.at(-1)?.offset === offset) {
				continue;
			}

			let from = 0;

			if (index !== 0) {
				from = defined(cues[index]).start;
			}

			shifts.push({
				from,
				offset,
			});
		}

		return shifts;
	}

	/** The index of the first word starting at or after `time`. */
	#firstAfter(time: number) {
		const words = this.#words;
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
	}

	/**
	 * The runs of spoken words near where a cue should be, best first, that
	 * share enough words with it.
	 */
	#candidates(cue: Cue, index: number, line: Line, offset: number) {
		const timePenalty = 0.3;

		const minimumScore = 0.15;

		/** A pause this long in speech ends a line, so a cue never spans one. */
		const pauseSeconds = 1.5;

		/** Farther than that, the words shared must weigh this much, such as two that carry meaning. */
		const minimumFarWeight = 1.5;

		/** Within this far of where a cue should be, one shared word can match it. */
		const nearSeconds = 1.2;

		const minimumDice = 0.3;

		const words = this.#words;
		const { weight } = line;

		if (weight < 0.5) {
			return [];
		}

		const expected = cue.start + offset;
		const longest = Math.min(40, Math.ceil(line.tokens.length * 1.8) + 3);
		const found: Candidate[] = [];

		for (let first = this.#firstAfter(expected - searchSeconds); first < words.length; first += 1) {
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

				const token = this.#spoken[last];

				if (token) {
					run.push(token);
				}

				const similarity = line.dice(run);

				if (similarity < minimumDice) {
					continue;
				}

				// A single shared word is a coincidence unless the run is where the cue should be.
				const distance = Math.abs(start - expected);

				if (distance > nearSeconds && line.shared(run) < minimumFarWeight) {
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

		const candidatesPerCue = 8;

		return found.toSorted((a, b) => b.score - a.score).slice(0, candidatesPerCue);
	}

	/**
	 * The run of spoken words each cue is said in, in order, chosen to share the
	 * most words overall: a cue picks from runs near where the offset puts it,
	 * and a cue picks only after the cues before it, so lines keep their order.
	 * Cues that match nothing well are skipped.
	 */
	#pick(voted: TimelineShift[]) {
		/** Cues that follow a matched cue and may be matched without a word of it in between. */
		const lookback = 6;

		const cues = this.#cues;

		const candidates = cues.map((cue, index) =>
			this.#candidates(
				cue,
				index,
				defined(this.#lines[index]),
				shiftTime(voted, cue.start) - cue.start,
			),
		);

		const best: {
			total: number;
			before: [number, number] | null;
		}[][] = candidates.map((row) =>
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
	}

	/**
	 * The offsets for cues without an anchor. The picture's are exact, so they
	 * stand wherever the speech agrees with them to within
	 * `pictureTolerance`; otherwise the speech's offset does, less the
	 * lead cues have over speech.
	 */
	#baseShifts(voted: TimelineShift[]) {
		/** A picture shift further than this from what the speech says is not trusted. */
		const pictureTolerance = 1.5;

		const picture = this.#picture;

		const boundaries = [
			...new Set([
				0,
				...voted.map((shift) => shift.from),
				...(picture ?? []).map((shift) => shift.from),
			]),
		].toSorted((a, b) => a - b);

		const shifts: TimelineShift[] = [];

		for (const from of boundaries) {
			const heard = shiftTime(voted, from) - from;
			let seen: number | null = null;

			if (picture) {
				seen = shiftTime(picture, from) - from;
			}

			let offset = heard - typicalLag;

			if (seen !== null && Math.abs(seen - heard) <= pictureTolerance) {
				offset = seen;
			}

			if (shifts.at(-1)?.offset !== offset) {
				shifts.push({
					from,
					offset,
				});
			}
		}

		return shifts;
	}

	/**
	 * When a cue shows if its line is the words `first` to `last`: from a
	 * little before the first to a little after the last, and no shorter than it
	 * takes to read, though never longer than it was.
	 */
	#show(cue: Cue, index: number, first: number, last: number) {
		/**
		 * How long a cue shows at least, as characters per second of reading time,
		 * with an absolute floor; a cue is never kept longer than it was.
		 */
		const readingRate = 20;

		/** How long after a line is spoken its cue stays, in seconds. */
		const tail = 0.25;

		/** How far before a line is spoken its cue appears, in seconds. */
		const lead = 0.15;

		const movedStart = Math.max(0, defined(this.#words[first]).start - lead);

		const minimumSeconds = 1;

		const readable = Math.min(
			cue.end - cue.start,
			Math.max(minimumSeconds, cue.text.length / readingRate),
		);

		return {
			cue: index,
			movedEnd: Math.max(defined(this.#words[last]).end + tail, movedStart + readable),
			movedStart,
		};
	}

	/**
	 * Where each picked cue goes: the start of its first shared word and the end
	 * of its last; see {@link Matching.#show}.
	 */
	#place(picked: Pick[]) {
		return picked.map((pick): Placed => {
			const line = defined(this.#lines[pick.cue]);

			const shared = (index: number) => {
				const token = this.#spoken[index];

				return !!token && line.has(token);
			};

			let { first } = pick;
			let { last } = pick;

			while (first < last && !shared(first)) {
				first += 1;
			}

			while (last > first && !shared(last)) {
				last -= 1;
			}

			return this.#show(defined(this.#cues[pick.cue]), pick.cue, first, last);
		});
	}

	/**
	 * The placed cues as anchors, in cue order, each ending before the next
	 * starts so cues placed by different means do not overlap. Cues that show
	 * together in the sub, such as a sign over a line of speech, keep doing so.
	 */
	#tidy(placed: Placed[]) {
		const cues = this.#cues;
		const anchors: CueAnchor[] = [];
		let before: Placed | null = null;

		for (const next of placed.toSorted((a, b) => a.cue - b.cue)) {
			const previous = anchors.at(-1);

			const together =
				before && defined(cues[next.cue]).start < defined(cues[before.cue]).end - 0.05;

			const overlapping = previous && !together && next.movedStart < previous.movedEnd;

			if (overlapping) {
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
	}

	/**
	 * Places cues whose words the dub does not share, such as when its script
	 * words a line differently, by when they are said. With the offset known, a
	 * cue that lies over a run of speech nothing else claimed is that speech.
	 * Cues that share a run, because the sub breaks a sentence up where the dub
	 * does not, split it between them by their length.
	 */
	#placeByTime(shifts: TimelineShift[], matched: Placed[]) {
		/** Speech a placed cue covers this much of is already said. */
		const claimedShare = 0.3;

		/** Speech is taken as a cue's only if it starts this near where the cue should. */
		const nearRunSeconds = 1;

		/** A cue is placed by time when this much of the shorter of it and the speech overlaps. */
		const minimumOverlap = 0.5;

		const cues = this.#cues;
		const words = this.#words;

		const runs = this.#phrases.map((run) => ({
			...run,
			end: defined(words[run.last]).end,
			start: defined(words[run.first]).start,
		}));

		const claimedCues = new Set(matched.map((placed) => placed.cue));

		const free = runs.filter(
			(run) =>
				!matched.some(
					(placed) =>
						Math.max(
							0,
							Math.min(placed.movedEnd, run.end) - Math.max(placed.movedStart, run.start),
						) >
						claimedShare * (run.end - run.start),
				),
		);

		const claims = new Map<(typeof runs)[number], number[]>();

		for (const [index, cue] of cues.entries()) {
			if (claimedCues.has(index) || defined(this.#lines[index]).weight < 0.5) {
				continue;
			}

			const offset = shiftTime(shifts, cue.start) - cue.start + typicalLag;

			const expected = {
				end: cue.end + offset,
				start: cue.start + offset,
			};

			let best: {
				run: (typeof runs)[number];
				share: number;
			} | null = null;

			for (const run of free) {
				const share =
					Math.max(0, Math.min(expected.end, run.end) - Math.max(expected.start, run.start)) /
					Math.min(expected.end - expected.start, run.end - run.start);

				const closer =
					share >= minimumOverlap &&
					Math.abs(run.start - expected.start) <= nearRunSeconds &&
					(!best || share > best.share);

				if (closer) {
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

				let { last } = run;

				if (position !== claiming.length - 1) {
					last = Math.max(first, run.first + Math.round((passed / total) * count) - 1);
				}

				const placed = this.#show(defined(cues[index]), index, first, last);
				first = Math.min(run.last, last + 1);

				return placed;
			});
		});
	}
}

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
export const retimeCues = (
	cues: Cue[],
	words: SpokenWord[],
	picture: TimelineShift[] | null,
): Refinement | null => new Matching(cues, words, picture).refine();
