import { and, eq } from "drizzle-orm";

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
export function usualLength(lengths: number[]) {
	if (lengths.length < minimumEpisodes) {
		return null;
	}

	const counts = new Map<number, number>();
	for (const length of lengths) {
		const whole = Math.round(length);
		counts.set(whole, (counts.get(whole) ?? 0) + 1);
	}

	const [first, second] = [...counts].sort((left, right) => right[1] - left[1]);
	return first && first[1] !== second?.[1] ? first[0] : null;
}

/** A segment brought to `usual` seconds from its start, whatever its length is now. */
export function withLength(segment: SkipSegment, usual: number | null): SkipSegment {
	if (usual === null || Math.round(segment.end - segment.start) === usual) {
		return segment;
	}

	return {
		...segment,
		end: segment.start + usual,
	};
}

/**
 * Remembers the length of an episode's segments and brings each to the
 * length the series' other episodes report. A provider that times one
 * episode's opening past the music keeps the skip button up over the
 * episode; its start is trusted, its length is not.
 *
 * Lengths are remembered as reported, so the usual one never follows an
 * earlier correction.
 */
export async function normalizeSkipSegments(
	seriesId: string,
	episode: number,
	audio: ContentLanguage,
	segments: SkipSegment[],
) {
	return Promise.all(
		segments.map(async (segment) => {
			const key = {
				seriesId,
				audio,
				kind: segment.kind,
			};
			await db
				.insert(skipSegmentLength)
				.values({
					...key,
					episode,
					seconds: segment.end - segment.start,
				})
				.onConflictDoUpdate({
					target: [
						skipSegmentLength.seriesId,
						skipSegmentLength.audio,
						skipSegmentLength.kind,
						skipSegmentLength.episode,
					],
					set: {
						seconds: segment.end - segment.start,
					},
				});

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
					),
				);

			return withLength(segment, usualLength(rows.map((row) => row.seconds)));
		}),
	);
}
