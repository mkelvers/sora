/**
 * From a point on one timeline on, how far the same picture sits on another,
 * in seconds.
 */
export interface TimelineShift {
  from: number;
  offset: number;
}

/** How close two segment boundaries must be to count as the same cut. */
const tolerance = 0.12;
/** An offset needs this many matching boundaries across the episode to be considered. */
const minimumVotes = 4;
/** Matches an offset must win to be worth switching to, so stray matches cannot. */
const switchPenalty = 6;
/** The most offsets weighed per boundary; later ones have too few votes to matter. */
const maximumCandidates = 32;
/** Below this share of matching boundaries, the encodes are not the same episode. */
const minimumMatched = 0.5;

/**
 * Maps one encode's timeline onto another's, such as a sub's onto its dub's,
 * from their HLS segment boundaries.
 *
 * Segments are cut at keyframes, and encoders put keyframes at scene cuts, so
 * two encodes of the same picture share most boundaries, shifted by however
 * much footage one adds or cuts before them. The shift can change along the
 * episode, such as after a dub's shorter opening, so it is found piecewise:
 * every offset that many boundaries agree on is a candidate, and each
 * boundary takes the candidate that matches, changing only where enough
 * boundaries agree it should.
 *
 * @param source - Segment start times of the encode to map from, ascending.
 * @param target - Segment start times of the encode to map onto, ascending.
 * @returns The shifts in order of `from`, or `null` when too few boundaries
 *   match for the encodes to be the same picture.
 */
export function alignTimelines(source: number[], target: number[]): TimelineShift[] | null {
  if (source.length === 0 || target.length === 0) {
    return null;
  }

  const offsets = candidateOffsets(source, target);
  if (offsets.length === 0) {
    return null;
  }

  const matches = source.map((time) =>
    offsets.map((offset) => Math.abs(nearest(target, time + offset) - (time + offset)) <= tolerance)
  );
  const path = bestPath(matches);

  const matched = path.filter((choice, index) => matches[index]?.[choice]).length;
  if (matched / source.length < minimumMatched) {
    return null;
  }

  const shifts: TimelineShift[] = [];
  path.forEach((choice, index) => {
    const offset = offsets[choice]!;
    if (shifts.at(-1)?.offset !== offset) {
      shifts.push({ from: index === 0 ? 0 : source[index]!, offset });
    }
  });
  return shifts;
}

/** Where a time on the source timeline lands on the target's. */
export function shiftTime(shifts: TimelineShift[], time: number) {
  const shift = shifts.findLast((candidate) => candidate.from <= time) ?? shifts[0];
  return shift ? time + shift.offset : time;
}

/** Offsets many boundary pairs agree on, most agreed first, each refined to the mean of its pairs. */
function candidateOffsets(source: number[], target: number[]) {
  const votes = new Map<number, number>();
  for (const from of source) {
    for (const to of target) {
      const bucket = Math.round((to - from) * 10);
      votes.set(bucket, (votes.get(bucket) ?? 0) + 1);
    }
  }

  const buckets: number[] = [];
  for (const [bucket] of [...votes].filter(([, count]) => count >= minimumVotes).sort((a, b) => b[1] - a[1])) {
    if (buckets.length === maximumCandidates) {
      break;
    }
    if (buckets.every((other) => Math.abs(other - bucket) > 3)) {
      buckets.push(bucket);
    }
  }

  return buckets.flatMap((bucket) => {
    const rough = bucket / 10;
    const pairs = source
      .map((time) => nearest(target, time + rough) - time)
      .filter((offset) => Math.abs(offset - rough) <= tolerance);
    return pairs.length > 0 ? [pairs.reduce((sum, offset) => sum + offset, 0) / pairs.length] : [];
  });
}

/**
 * The candidate per boundary that matches most boundaries overall, paying
 * {@link switchPenalty} per change (Viterbi).
 */
function bestPath(matches: boolean[][]) {
  let scores = matches[0]!.map(Number);
  const cameFrom: number[][] = [];

  for (const row of matches.slice(1)) {
    const leader = scores.indexOf(Math.max(...scores));
    const switched = scores[leader]! - switchPenalty;
    cameFrom.push(scores.map((stay, choice) => (stay >= switched ? choice : leader)));
    scores = scores.map((stay, choice) => Math.max(stay, switched) + Number(row[choice]));
  }

  const path = [scores.indexOf(Math.max(...scores))];
  for (const step of cameFrom.toReversed()) {
    path.unshift(step[path[0]!]!);
  }
  return path;
}

/** The value in ascending `sorted` closest to `time`. */
function nearest(sorted: number[], time: number) {
  let low = 0;
  let high = sorted.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sorted[middle]! < time) {
      low = middle + 1;
    } else {
      high = middle;
    }
  }

  const before = sorted[low - 1] ?? -Infinity;
  const after = sorted[low] ?? Infinity;
  return time - before <= after - time ? before : after;
}
