/**
 * Pure matching rules that place an AniList entry on TMDB.
 *
 * AniList and TMDB share no identifiers, so matching relies on what both
 * describe independently: air dates, episode counts, runtimes, titles, and
 * the AniList prequel chain. Air dates are the strongest signal. Both
 * databases record Japanese broadcast dates, so an entry's first episode and
 * the TMDB episode it corresponds to usually air on the same day.
 *
 * Nothing here performs I/O; see `mapping.ts` for how candidates are found.
 */
import type { AnimeFormat } from "../catalog/models/anime";
import type { TmdbEpisode, TmdbMovieResult, TmdbShow } from "../tmdb/resources";

/** An AniList entry reduced to the facts matching uses. */
export interface MatchSubject {
  format: AnimeFormat | null;
  /** Every known title: English, romaji, and native first, then synonyms. */
  titles: string[];
  /** How many leading entries of `titles` are primary titles rather than synonyms. */
  primaryTitleCount: number;
  /** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`. Only full dates are compared day by day. */
  startDate: string | null;
  endDate: string | null;
  /** Planned episode count, or the number aired so far when the total is unknown. */
  episodes: number | null;
  /** Typical episode length in minutes. */
  durationMinutes: number | null;
}

/** Identifies one TMDB episode of a show. */
export interface TmdbEpisodeRef {
  seasonNumber: number;
  episodeNumber: number;
}

/** One AniList episode and the TMDB episode it corresponds to. */
export interface EpisodeLink extends TmdbEpisodeRef {
  anilistEpisode: number;
}

/** A TMDB show that might contain the subject. */
export interface ShowCandidate {
  show: Pick<TmdbShow, "id" | "name" | "originalName" | "episodes">;
  /**
   * Whether the subject's prequel or parent maps to this show. Franchises
   * keep their seasons and specials together, so such a show is preferred
   * over a same-dated duplicate entry elsewhere on TMDB.
   */
  isFranchiseShow: boolean;
  /**
   * The last TMDB episode of the subject's direct prequel, when the prequel
   * is a regular season of this show. A sequel usually starts right after
   * it, which places it even when TMDB has no air dates.
   */
  prequelEnd: TmdbEpisodeRef | null;
}

/** Where the subject sits on TMDB, with the evidence behind it. */
export type Placement =
  | {
      mediaType: "tv";
      tmdbId: number;
      /** The subject's episodes that TMDB lists, in order. Never empty. */
      episodes: EpisodeLink[];
      method: "air-date" | "continuation" | "title";
      score: number;
    }
  | {
      mediaType: "movie";
      tmdbId: number;
      method: "release-date" | "title";
      score: number;
    };

/**
 * The lowest score {@link placeInShow} accepts.
 *
 * A same-day start alone clears it; a start a week off needs a matching end
 * date or a prequel to back it up.
 */
export const minimumShowScore = 70;

/** How far a TMDB start may drift from AniList's before it is not considered at all. */
const startWindowDays = 10;

/** Episodes airing this long after the AniList end date belong to something else. */
const endGraceDays = 3;

/**
 * Without a known length, an entry is assumed to end at the first break in
 * weekly broadcasts longer than this.
 */
const broadcastBreakDays = 45;

/**
 * Episode lengths further apart than this factor are different kinds of
 * content, such as a two-minute short against a full episode. A double-length
 * premiere stays within it.
 */
const regularRuntimeTolerance = 2.2;

/**
 * Specials interleave extras of every length, so their runtimes must agree
 * more closely: a 13-minute picture drama is not a 25-minute OVA episode.
 */
const specialsRuntimeTolerance = 1.6;

/** How far a special matched by name may air from AniList's start date. */
const specialTitleWindowDays = 365;

/** Shorter distinctive names, such as "OVA" or "Extra", are too generic to match specials by. */
const minimumSpecialNameLength = 6;

/**
 * A title-only film match may still differ this much in release date, which
 * covers festival premieres ahead of the theatrical run but not a bonus short
 * released months after its film.
 */
const titleOnlyReleaseWindowDays = 120;

/**
 * Finds the best position for `subject` in a TMDB show.
 *
 * Regular seasons are treated as one continuous sequence, since an AniList
 * entry may cover several TMDB seasons (Naruto Shippuden) or share one with
 * other entries (Re:Zero keeps every cour in a single TMDB season). Specials
 * (season 0) form a separate sequence in which unrelated extras are
 * interleaved by release date, so there episodes of the wrong length are
 * skipped rather than claimed.
 *
 * Specials, OVAs, and movies are looked for among TMDB's specials, or as
 * the start of a show that TMDB lists for the OVA on its own; a one-off
 * airing the same week as a regular episode is not that episode.
 *
 * @returns The best-scoring placement, or `null` when nothing reaches
 *   {@link minimumShowScore}.
 */
export function placeInShow(subject: MatchSubject, candidate: ShowCandidate): Placement | null {
  const start = dayNumber(subject.startDate);
  const end = dayNumber(subject.endDate);
  const nameSimilarity = bestSimilarity(subject.titles, [candidate.show.name, candidate.show.originalName]);
  const tracks = [
    regularTrack(candidate.show.episodes),
    specialsTrack(candidate.show.episodes)
  ];

  let best: Placement | null = null;
  for (const track of tracks) {
    const isRegular = track[0] !== undefined && track[0].season_number > 0;
    const continuation = isRegular && candidate.prequelEnd ? indexAfter(track, candidate.prequelEnd) : null;

    for (const index of startIndexes(track, start, continuation)) {
      if (continuation !== null && index < continuation) {
        // The prequel already occupies these episodes.
        continue;
      }

      const isContinuation = index === continuation;
      const mayTakeRegularEpisodes =
        isSeriesFormat(subject.format) ||
        isOwnShowStart(track, index, start, candidate) ||
        // An OVA series continuing its franchise's show must also air when
        // that episode did; an OVA released between seasons is not the next season.
        (isContinuation && airsNear(track[index], start));
      if (isRegular && !mayTakeRegularEpisodes) {
        continue;
      }

      const picked = pick(track, index, subject, end, isRegular);
      if (isRegular) {
        picked.push(...overflowSpecials(candidate.show.episodes, picked, subject, end));
      }

      const isPartialOva = !isSeriesFormat(subject.format) && subject.episodes !== null && picked.length < subject.episodes;
      if (isRegular && isPartialOva) {
        // An OVA released all at once cannot be a run of weekly episodes
        // that mostly air after it ended.
        continue;
      }

      const first = picked[0];
      const last = picked.at(-1);
      const isWrongLength =
        isRegular && !runtimesAgree(medianRuntime(picked), subject.durationMinutes, regularRuntimeTolerance);
      if (!first || !last || isWrongLength) {
        continue;
      }

      const firstAirDay = dayNumber(first.air_date);
      const lastAirDay = dayNumber(last.air_date);
      const startOffset = start !== null && firstAirDay !== null ? firstAirDay - start : null;

      const evidence = startScore(startOffset, isContinuation) + (isContinuation ? 40 : 0) + endScore(end, lastAirDay);
      const coverage = subject.episodes ? Math.min(picked.length / subject.episodes, 1) : 1;
      const score =
        evidence * (0.5 + 0.5 * coverage) +
        (isRegular ? 10 : 0) +
        (candidate.isFranchiseShow ? 25 : 0) +
        20 * nameSimilarity;

      if (score >= minimumShowScore && (!best || score > best.score)) {
        const leading = skippedLeadingEpisodes(startOffset) > 0 ? leadingSpecial(candidate.show.episodes, start) : null;
        const firstAnilistEpisode = skippedLeadingEpisodes(startOffset) + 1;
        best = {
          mediaType: "tv",
          tmdbId: candidate.show.id,
          episodes: [
            ...(isRegular && leading
              ? [
                  {
                    anilistEpisode: 1,
                    seasonNumber: leading.season_number,
                    episodeNumber: leading.episode_number
                  }
                ]
              : []),
            ...picked.map((episode, offset) => ({
              anilistEpisode: firstAnilistEpisode + offset,
              seasonNumber: episode.season_number,
              episodeNumber: episode.episode_number
            }))
          ],
          method: startOffset !== null && Math.abs(startOffset) <= startWindowDays ? "air-date" : "continuation",
          score
        };
      }
    }
  }

  return best ?? placeByTitle(subject, candidate, nameSimilarity) ?? placeSpecialByTitle(subject, candidate);
}

/**
 * Places a subject that is a whole single show on its own when the air
 * dates disagree, as they sometimes do by weeks for older titles: the show
 * must carry the subject's name, premiere the same year, and have exactly
 * the subject's episodes.
 */
function placeByTitle(subject: MatchSubject, candidate: ShowCandidate, nameSimilarity: number): Placement | null {
  const track = regularTrack(candidate.show.episodes);
  const firstYear = yearOf(track[0]?.air_date ?? null);
  const matches =
    nameSimilarity >= 0.9 &&
    subject.episodes !== null &&
    track.length === subject.episodes &&
    firstYear !== null &&
    firstYear === yearOf(subject.startDate);

  if (!matches) {
    return null;
  }

  return {
    mediaType: "tv",
    tmdbId: candidate.show.id,
    episodes: track.map((episode, offset) => ({
      anilistEpisode: offset + 1,
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number
    })),
    method: "title",
    score: minimumShowScore
  };
}

/**
 * Places a special or OVA among its franchise show's specials by name when
 * the air dates disagree, as they do by months for OVAs bundled with manga
 * volumes. The TMDB special must be named what the subject's title adds to
 * the show's ("HAIKYU!! LAND VS. AIR" is "Land vs. Air") and air within
 * {@link specialTitleWindowDays} of AniList's start. The subject's later
 * episodes follow it among the specials.
 */
function placeSpecialByTitle(subject: MatchSubject, candidate: ShowCandidate): Placement | null {
  if (!candidate.isFranchiseShow || isSeriesFormat(subject.format)) {
    return null;
  }

  const showNames = [
    candidate.show.name,
    candidate.show.originalName
  ].map(normalizeTitle);
  const names = subject.titles.slice(0, subject.primaryTitleCount).flatMap((title) => {
    const normalized = normalizeTitle(title);
    const showName = showNames.find((name) => normalized.startsWith(`${name} `));
    return showName ? [normalized.slice(showName.length + 1)] : [];
  }).filter((name) => name.length >= minimumSpecialNameLength);

  const track = specialsTrack(candidate.show.episodes);
  const start = dayNumber(subject.startDate);
  const index = track.findIndex((episode) => {
    const airDay = dayNumber(episode.air_date);
    return (
      (start === null || airDay === null || Math.abs(airDay - start) <= specialTitleWindowDays) &&
      runtimesAgree(episode.runtime, subject.durationMinutes, specialsRuntimeTolerance) &&
      episode.name !== null && bestSimilarity(names, [episode.name]) >= 0.9
    );
  });
  if (index === -1) {
    return null;
  }

  return {
    mediaType: "tv",
    tmdbId: candidate.show.id,
    episodes: pick(track, index, subject, null, false).map((episode, offset) => ({
      anilistEpisode: offset + 1,
      seasonNumber: episode.season_number,
      episodeNumber: episode.episode_number
    })),
    method: "title",
    score: minimumShowScore
  };
}

/**
 * Decides whether a TMDB movie is the subject.
 *
 * A release within a month of AniList's start date plus a loosely similar
 * title is accepted, since franchises rarely release two films that close
 * together. Otherwise the titles must match nearly exactly, because bonus
 * shorts are often named after the film they accompany.
 *
 * @returns A placement, or `null` when the movie is not a confident match.
 */
export function placeAsMovie(subject: MatchSubject, movie: TmdbMovieResult): Placement | null {
  const movieTitles = [movie.title, movie.original_title];
  const similarity = bestSimilarity(subject.titles, movieTitles);
  const start = dayNumber(subject.startDate);
  const release = dayNumber(movie.release_date);
  const subjectYear = yearOf(subject.startDate);
  const releaseYear = yearOf(movie.release_date);

  const offset = start !== null && release !== null ? Math.abs(release - start) : null;
  if (offset !== null && offset <= 31 && similarity >= 0.35) {
    return {
      mediaType: "movie",
      tmdbId: movie.id,
      method: "release-date",
      score: 100 - offset + 60 * similarity
    };
  }

  // Synonyms often name the parent film, so a title-only match uses the
  // primary titles alone, and the titles must number the same instalment.
  const primarySimilarity = bestSimilarity(subject.titles.slice(0, subject.primaryTitleCount), movieTitles, {
    sameNumbers: true
  });
  const datesAgree =
    offset !== null
      ? offset <= titleOnlyReleaseWindowDays
      : subjectYear === null || releaseYear === null || subjectYear === releaseYear;
  if (primarySimilarity >= 0.92 && datesAgree) {
    return {
      mediaType: "movie",
      tmdbId: movie.id,
      method: "title",
      score: 30 + 60 * primarySimilarity
    };
  }

  return null;
}

/** TMDB's regular seasons as one sequence, in broadcast order. */
export function regularTrack(episodes: readonly TmdbEpisode[]) {
  return episodes.filter((episode) => episode.season_number > 0);
}

/** TMDB's specials season. */
export function specialsTrack(episodes: readonly TmdbEpisode[]) {
  return episodes.filter((episode) => episode.season_number === 0);
}

/**
 * Scores how alike two titles are, from 0 to 1.
 *
 * Uses the Sørensen–Dice coefficient over character bigrams of normalised
 * titles, which tolerates reordered words, romanisation differences, and
 * subtitles, and works for Japanese titles without tokenisation.
 */
export function titleSimilarity(left: string, right: string) {
  const a = bigrams(normalizeTitle(left));
  const b = bigrams(normalizeTitle(right));
  if (a.size === 0 || b.size === 0) {
    return 0;
  }

  let shared = 0;
  for (const [gram, count] of a) {
    shared += Math.min(count, b.get(gram) ?? 0);
  }

  const total = [...a.values(), ...b.values()].reduce((sum, count) => sum + count, 0);
  return (2 * shared) / total;
}

/**
 * The highest similarity between any title in `left` and any in `right`.
 *
 * @param options.sameNumbers - Only compare pairs that contain the same
 *   numbers, so "Infinity Castle" never matches "Infinity Castle 2" however
 *   alike the rest of the title is.
 */
export function bestSimilarity(
  left: readonly string[],
  right: readonly string[],
  options: {
    sameNumbers?: boolean;
  } = {}
) {
  let best = 0;
  for (const a of left) {
    for (const b of right) {
      if (!options.sameNumbers || numbersIn(a) === numbersIn(b)) {
        best = Math.max(best, titleSimilarity(a, b));
      }
    }
  }

  return best;
}

/**
 * Whether a special or OVA may start at `index` of a show's regular seasons,
 * other than straight after its prequel there.
 *
 * A special airing the same week as a regular episode is not that episode,
 * and an OVA released days before its franchise's TV premiere is not the
 * premiere. Otherwise an OVA only takes regular episodes when TMDB lists a
 * show for the OVA itself: outside its franchise's show, starting at the
 * first episode, on the same day.
 */
function isOwnShowStart(track: readonly TmdbEpisode[], index: number, start: number | null, candidate: ShowCandidate) {
  const firstAirDay = dayNumber(track[index]?.air_date ?? null);
  return (
    index === 0 &&
    !candidate.isFranchiseShow &&
    start !== null &&
    firstAirDay !== null &&
    Math.abs(firstAirDay - start) <= 1
  );
}

/** Whether an episode aired within the start window of `start`. */
function airsNear(episode: TmdbEpisode | undefined, start: number | null) {
  const airDay = dayNumber(episode?.air_date ?? null);
  return airDay !== null && start !== null && Math.abs(airDay - start) <= startWindowDays;
}

/** Formats that run as a series of episodes and may be a regular TMDB season. */
function isSeriesFormat(format: AnimeFormat | null) {
  return format === "TV" || format === "TV_SHORT" || format === "ONA" || format === null;
}

/**
 * Candidate start positions: episodes airing near the subject's start date,
 * plus the episode right after the prequel. Only the first episode of each
 * air date is a start, because simultaneous releases are one batch.
 */
function startIndexes(track: readonly TmdbEpisode[], start: number | null, continuation: number | null) {
  const indexes = new Set<number>();
  if (continuation !== null && continuation < track.length) {
    indexes.add(continuation);
  }

  if (start !== null) {
    let previousDay: number | null = null;
    track.forEach((episode, index) => {
      const airDay = dayNumber(episode.air_date);
      if (airDay !== null && airDay !== previousDay && Math.abs(airDay - start) <= startWindowDays) {
        indexes.add(index);
      }

      previousDay = airDay;
    });
  }

  return indexes;
}

/**
 * Collects the episodes from `index` that belong to the subject: up to its
 * episode count, and never past its end date. When both are unknown the run
 * ends at the first long broadcast break.
 *
 * Regular seasons are taken as a contiguous run. Among specials, episodes of
 * the wrong length are skipped, since TMDB interleaves unrelated extras.
 */
function pick(track: readonly TmdbEpisode[], index: number, subject: MatchSubject, end: number | null, isRegular: boolean) {
  const picked: TmdbEpisode[] = [];
  let previousDay: number | null = null;

  for (const episode of track.slice(index)) {
    if (subject.episodes !== null && picked.length >= subject.episodes) {
      break;
    }

    const airDay = dayNumber(episode.air_date);
    if (airDay !== null && end !== null && airDay > end + endGraceDays) {
      break;
    }

    const isBreak =
      airDay !== null &&
      previousDay !== null &&
      subject.episodes === null &&
      end === null &&
      airDay - previousDay > broadcastBreakDays;
    if (isBreak) {
      break;
    }

    if (!isRegular && !runtimesAgree(episode.runtime, subject.durationMinutes, specialsRuntimeTolerance)) {
      if (picked.length === 0) {
        // The run must start with one of the subject's own episodes.
        break;
      }

      continue;
    }

    picked.push(episode);
    previousDay = airDay ?? previousDay;
  }

  return picked;
}

/** The index right after `ref` in `track`, or `null` when `ref` is not on it. */
function indexAfter(track: readonly TmdbEpisode[], ref: TmdbEpisodeRef) {
  const index = track.findIndex(
    (episode) => episode.season_number === ref.seasonNumber && episode.episode_number === ref.episodeNumber
  );

  return index === -1 ? null : index + 1;
}

/** Whether two episode lengths describe the same kind of content. Unknown lengths agree with anything. */
function runtimesAgree(tmdbMinutes: number | null, anilistMinutes: number | null, tolerance: number) {
  if (!tmdbMinutes || !anilistMinutes) {
    return true;
  }

  return Math.max(tmdbMinutes, anilistMinutes) / Math.min(tmdbMinutes, anilistMinutes) <= tolerance;
}

function medianRuntime(episodes: readonly TmdbEpisode[]) {
  const runtimes = episodes
    .map((episode) => episode.runtime)
    .filter((runtime): runtime is number => runtime !== null && runtime > 0)
    .sort((left, right) => left - right);

  return runtimes[Math.floor(runtimes.length / 2)] ?? null;
}

function startScore(offset: number | null, isContinuation: boolean) {
  if (offset === null) {
    return isContinuation ? 60 : 0;
  }

  const distance = Math.abs(offset);
  if (distance <= 1) {
    return 100;
  }

  if (distance <= 3) {
    return 75;
  }

  if (distance <= 7) {
    return 50;
  }

  return distance <= startWindowDays ? 30 : 0;
}

function endScore(end: number | null, lastAirDay: number | null) {
  if (end === null || lastAirDay === null) {
    return 0;
  }

  const distance = Math.abs(lastAirDay - end);
  if (distance <= 1) {
    return 40;
  }

  if (distance <= 7) {
    return 20;
  }

  return distance <= 30 ? 0 : -40;
}

/**
 * When TMDB's first matching episode airs about a week after AniList's start,
 * AniList counts an extra leading episode (often an "episode 0" that TMDB
 * files under specials), so AniList's second episode is TMDB's first.
 */
function skippedLeadingEpisodes(startOffset: number | null) {
  return startOffset !== null && startOffset >= 5 && startOffset <= startWindowDays ? 1 : 0;
}

/**
 * AniList episodes beyond the end of a regular run that TMDB lists as
 * specials, such as Bakemonogatari's last three episodes, which were
 * released online months after the broadcast. They are the specials of the
 * right length airing after the run and before the entry ends.
 */
function overflowSpecials(episodes: readonly TmdbEpisode[], picked: readonly TmdbEpisode[], subject: MatchSubject, end: number | null) {
  const missing = subject.episodes !== null ? subject.episodes - picked.length : 0;
  const lastAirDay = dayNumber(picked.at(-1)?.air_date ?? null);
  if (missing <= 0 || end === null || lastAirDay === null) {
    return [];
  }

  return specialsTrack(episodes)
    .filter((episode) => {
      const airDay = dayNumber(episode.air_date);
      return (
        airDay !== null &&
        airDay > lastAirDay &&
        airDay <= end + endGraceDays &&
        runtimesAgree(episode.runtime, subject.durationMinutes, specialsRuntimeTolerance)
      );
    })
    .slice(0, missing);
}

/**
 * The special that is AniList's leading "episode 0": aired on the entry's
 * start date, a week before TMDB's first regular episode of it.
 */
function leadingSpecial(episodes: readonly TmdbEpisode[], start: number | null) {
  return (
    specialsTrack(episodes).find((episode) => {
      const airDay = dayNumber(episode.air_date);
      return start !== null && airDay !== null && Math.abs(airDay - start) <= 1;
    }) ?? null
  );
}

/** Days since the Unix epoch for a full `YYYY-MM-DD` date; partial dates yield `null`. */
function dayNumber(date: string | null) {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})/.exec(date) : null;
  if (!match) {
    return null;
  }

  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])) / 86_400_000;
}

function yearOf(date: string | null) {
  const match = date ? /^(\d{4})/.exec(date) : null;
  return match ? Number(match[1]) : null;
}

/**
 * Lowercases, folds full-width characters, and reduces punctuation to single
 * spaces, so "Re:ZERO -Starting Life-" and "Re: Zero Starting Life" compare equal.
 */
export function normalizeTitle(title: string) {
  return title
    .normalize("NFKC")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The title's numbers in order, such as `"2"` for "Infinity Castle Part 2". */
function numbersIn(title: string) {
  return (normalizeTitle(title).match(/\d+/g) ?? []).map(Number).join(" ");
}

function bigrams(value: string) {
  const grams = new Map<string, number>();
  for (let index = 0; index < value.length - 1; index += 1) {
    const gram = value.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }

  return grams;
}
