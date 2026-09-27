import { popularityWeight } from "../../catalog/queries/search";
import type { WatchlistStatus } from "../watchlist/watchlist";

/**
 * How a title's place on the watchlist counts toward taste. A dropped title
 * counts against what it is like.
 */
const statusWeights: Record<WatchlistStatus, number> = {
  completed: 2,
  watching: 1.5,
  paused: 1,
  planning: 0.5,
  dropped: -1.5,
};

/** Days after which a title counts half as much toward taste. */
const halfLifeDays = 180;

/** The least an old title counts, so long-held taste is not forgotten. */
const minimumRecency = 0.25;

/** How much users' "if you liked this" votes count against sharing genres. */
const votesShare = 0.65;

/** What a profile did with a title, as taste sees it. */
export interface TitleActivity {
  status: WatchlistStatus | null;
  /** Episodes of the title played at all. */
  episodesPlayed: number;
  /** When the profile last played or listed the title. */
  lastActiveAt: Date;
}

/**
 * How strongly a title says what a profile likes: more for finished and
 * much-watched titles, less as it recedes, and negative for a dropped one.
 */
export function titleWeight(activity: TitleActivity, now: Date): number {
  if (activity.status === "dropped") {
    return statusWeights.dropped;
  }

  const ageDays = Math.max(0, now.getTime() - activity.lastActiveAt.getTime()) / 86_400_000;
  const recency = Math.max(minimumRecency, 0.5 ** (ageDays / halfLifeDays));
  const listed = activity.status === null ? (activity.episodesPlayed > 0 ? 1 : 0) : statusWeights[activity.status];
  return (listed + Math.log2(1 + activity.episodesPlayed)) * recency;
}

/** A title a profile has seen or listed, as a source of taste. */
export interface TasteSeed {
  weight: number;
  genres: readonly string[];
  /** AniList IDs users recommend for the title, most recommended first. */
  recommended: readonly number[];
}

/** What a profile likes: a weight per genre, and votes for titles to watch. */
export interface Taste {
  genres: Map<string, number>;
  votes: Map<number, number>;
}

/**
 * Adds seeds up into a taste. A seed's weight spreads over its genres, so a
 * title with many genres does not outweigh one with few; its first
 * recommendation counts fully and its last about half.
 */
export function tasteOf(seeds: readonly TasteSeed[]): Taste {
  const genres = new Map<string, number>();
  const votes = new Map<number, number>();

  for (const seed of seeds) {
    const perGenre = seed.genres.length > 0 ? seed.weight / Math.sqrt(seed.genres.length) : 0;
    for (const genre of new Set(seed.genres)) {
      genres.set(genre, (genres.get(genre) ?? 0) + perGenre);
    }

    seed.recommended.forEach((anilistId, index) => {
      const rank = 1 - (0.5 * index) / Math.max(1, seed.recommended.length);
      votes.set(anilistId, (votes.get(anilistId) ?? 0) + seed.weight * rank);
    });
  }

  return {
    genres,
    votes,
  };
}

/** The genres a taste leans to most, strongest first. */
export function favoriteGenres(taste: Taste, count: number): string[] {
  return [...taste.genres]
    .filter(([, weight]) => weight > 0)
    .sort(([, left], [, right]) => right - left)
    .slice(0, count)
    .map(([genre]) => genre);
}

/** A title that could be recommended, from the search index. */
export interface Candidate {
  anilistId: number;
  genres: readonly string[];
  popularity: number;
  /** AniList's weighted score, 0–100. */
  averageScore: number | null;
}

/**
 * Orders candidates by how well they fit a taste, best first, leaving out
 * those that do not fit at all.
 *
 * Fit blends users' votes, relative to the most-voted candidate, with the
 * cosine similarity of the candidate's genres to the taste's. It is then
 * weighed by quality, so a well-liked, widely watched title wins over an
 * obscure one that fits as well.
 */
export function rankCandidates<TCandidate extends Candidate>(taste: Taste, candidates: readonly TCandidate[]): TCandidate[] {
  const positive = [...taste.genres.values()].filter((weight) => weight > 0);
  const norm = Math.sqrt(positive.reduce((sum, weight) => sum + weight ** 2, 0));
  const mostVotes = Math.max(0, ...taste.votes.values());

  const scored = candidates.map((candidate) => {
    const votes = mostVotes > 0 ? Math.max(0, taste.votes.get(candidate.anilistId) ?? 0) / mostVotes : 0;
    const overlap = candidate.genres.reduce((sum, genre) => sum + (taste.genres.get(genre) ?? 0), 0);
    const similarity =
      norm > 0 && candidate.genres.length > 0 ? Math.max(0, overlap) / (norm * Math.sqrt(candidate.genres.length)) : 0;
    const fit = votesShare * votes + (1 - votesShare) * similarity;
    const quality = popularityWeight(candidate.popularity) * (0.6 + (0.4 * (candidate.averageScore ?? 60)) / 100);

    return {
      candidate,
      score: fit * quality,
    };
  });

  return scored
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ candidate }) => candidate);
}
