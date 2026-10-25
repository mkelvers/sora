import { attempt, inParallel } from "@sora/shared";
import { and, eq, gt, sql } from "drizzle-orm";

import { db } from "../../database/client";
import { skipSegmentLength } from "../../database/schema";
import type { SkipSegment } from "../../models/playback";
import type { ContentLanguage } from "../../models/series";

/** Episodes that must have reported a length before any is called the usual one. */
const minimumEpisodes = 3;

/**
 * The length the most episodes report, to the second. `null` with too few
 * episodes, or when two lengths are tied for most.
 */
export const usualLength = (lengths: number[]) => {
	if (lengths.length < minimumEpisodes) {
		return null;
	}

	const counts = new Map<number, number>();
	for (const length of lengths) {
		const whole = Math.round(length);
		counts.set(whole, (counts.get(whole) ?? 0) + 1);
	}

	const [first, second] = [...counts].toSorted((left, right) => right[1] - left[1]);
	return first && first[1] !== second?.[1] ? first[0] : null;
};

/** A segment brought to `usual` seconds from its start, whatever its length is now. */
export const withLength = (segment: SkipSegment, usual: number | null): SkipSegment => {
	if (usual === null || Math.round(segment.end - segment.start) === usual) {
		return segment;
	}

	return {
		...segment,
		end: segment.start + usual,
	};
};

/** How many sibling episodes are asked of a provider at once. */
const learnConcurrency = 6;

/** How long learning the other episodes may hold playback, in milliseconds. */
const learnDeadlineMs = 8000;

const kinds = ["opening", "ending"] as const satisfies readonly SkipSegment["kind"][];

/** The series' other episodes, as the provider that served this one reports them. */
export interface SkipSource {
	/** Every episode the provider lists, numbered as the series numbers them. */
	episodes: number[];
	/** The segments the provider ships with an episode; `null` when it cannot be streamed. */
	skipSegments: (episode: number) => Promise<SkipSegment[] | null>;
}

/**
 * Remembers how long an episode's segments are, as reported. A kind the
 * episode has no segment of is remembered as 0, so the episode counts as seen.
 * With `keep`, a length already stored stays.
 */
const remember = async (
	seriesId: string,
	episode: number,
	audio: ContentLanguage,
	segments: SkipSegment[],
	keep: boolean,
) => {
	await db
		.insert(skipSegmentLength)
		.values(
			kinds.map((kind) => {
				const segment = segments.find((candidate) => candidate.kind === kind);
				return {
					audio,
					episode,
					kind,
					seconds: segment ? segment.end - segment.start : 0,
					seriesId,
				};
			}),
		)
		.onConflictDoUpdate({
			set: {
				seconds: keep ? skipSegmentLength.seconds : sql`excluded.seconds`,
			},
			target: [
				skipSegmentLength.seriesId,
				skipSegmentLength.audio,
				skipSegmentLength.kind,
				skipSegmentLength.episode,
			],
		});
};

/**
 * Asks the provider for the episodes of the series not yet remembered, so a
 * series whose episodes were never played has a usual length from the first.
 */
const learn = async (
	seriesId: string,
	episode: number,
	audio: ContentLanguage,
	source: SkipSource,
) => {
	const seen = await db
		.selectDistinct({
			episode: skipSegmentLength.episode,
		})
		.from(skipSegmentLength)
		.where(and(eq(skipSegmentLength.seriesId, seriesId), eq(skipSegmentLength.audio, audio)));
	const known = new Set(seen.map((row) => row.episode));
	const missing = source.episodes.filter((number) => number !== episode && !known.has(number));

	const deadline = new AbortController();
	await Promise.race([
		inParallel(
			missing,
			learnConcurrency,
			async (number) => {
				const { data } = await attempt(source.skipSegments(number));
				await remember(seriesId, number, audio, data ?? [], true);
			},
			deadline.signal,
		),
		Bun.sleep(learnDeadlineMs),
	]);
	deadline.abort();
};

/**
 * Remembers the length of an episode's segments and brings each to the
 * length the series' other episodes report. A provider that times one
 * episode's opening past the music keeps the skip button up over the
 * episode; its start is trusted, its length is not.
 *
 * The first time a series is seen, the provider is asked for its other
 * episodes, so an outlier is corrected on its first play rather than after
 * enough episodes were watched.
 *
 * Lengths are remembered as reported, so the usual one never follows an
 * earlier correction.
 */
export const normalizeSkipSegments = async (
	seriesId: string,
	episode: number,
	audio: ContentLanguage,
	segments: SkipSegment[],
	source?: SkipSource,
) => {
	await remember(seriesId, episode, audio, segments, false);
	if (segments.length === 0) {
		return segments;
	}
	if (source) {
		await attempt(learn(seriesId, episode, audio, source));
	}

	return Promise.all(
		segments.map(async (segment) => {
			const rows = await db
				.select({
					seconds: skipSegmentLength.seconds,
				})
				.from(skipSegmentLength)
				.where(
					and(
						eq(skipSegmentLength.seriesId, seriesId),
						eq(skipSegmentLength.audio, audio),
						eq(skipSegmentLength.kind, segment.kind),
						gt(skipSegmentLength.seconds, 0),
					),
				);

			return withLength(segment, usualLength(rows.map((row) => row.seconds)));
		}),
	);
};
