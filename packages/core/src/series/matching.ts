/**
 * Pure matching rules that place an AniList entry on TMDB.
 *
 * AniList and TMDB share no identifiers, so matching relies on what both
 * describe independently: air dates, episode counts, runtimes, titles, and
 * the AniList prequel chain. Air dates are the strongest signal. Both
 * databases record Japanese broadcast dates, so an entry's first episode and
 * the TMDB episode it corresponds to usually air on the same day.
 *
 * Once an entry's first episode is found, AniList's episode count decides
 * how many episodes it has, since AniList is what playback follows. TMDB's
 * dates can differ from AniList's by days or, for older titles, by years,
 * so they only mark where a run cannot continue: after a broadcast break
 * that follows the entry's end, or, for an entry that has not aired yet,
 * anywhere TMDB's episodes have already aired.
 *
 * Nothing here performs I/O; see `mapping.ts` for how candidates are found.
 */
import type { AnimeFormat } from "../catalog/models/anime";
import type { TmdbEpisode, TmdbEpisodeGroup, TmdbMovieResult, TmdbShow } from "../tmdb/resources";
import { AirDate } from "./air-date";
import { Arrangement } from "./arrangement";
import { EpisodeTrack } from "./episode-track";
import type { TmdbEpisodeRef } from "./episode-track";
import { Runtime } from "./runtime";
import { TitleText } from "./title-text";

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
	/** Highest playable episode number from AniKoto, preferred over AniList's count. */
	playbackEpisodes?: number | null;
	/**
	 * `YYYY-MM-DD` before which none of the entry's episodes aired. For an
	 * entry AniList lists as not yet released it is the day matching runs,
	 * since AniList releases an entry once its first episode airs; otherwise
	 * `null`, since TMDB may date an entry's episodes before AniList does.
	 */
	airsFrom: string | null;
	/** Typical episode length in minutes. */
	durationMinutes: number | null;
}

/** One AniList episode and the TMDB episode it corresponds to. */
export interface EpisodeLink extends TmdbEpisodeRef {
	anilistEpisode: number;
}

/** Where a prequel's regular episodes run in a TMDB show. */
export interface PrequelRun {
	first: TmdbEpisodeRef;
	last: TmdbEpisodeRef;
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
	 * The first and last TMDB episodes of the subject's direct prequel, when
	 * the prequel is a regular season of this show. A sequel usually starts
	 * right after it, which places it even when TMDB has no air dates.
	 */
	prequel: PrequelRun | null;
}

/** Where the subject sits on TMDB, with the evidence behind it. */
export type Placement =
	| {
			mediaType: "tv";
			tmdbId: number;
			/** The subject's episodes that TMDB lists, in order. Never empty. */
			episodes: EpisodeLink[];
			method: "air-date" | "continuation" | "title" | "episode-group" | "compilation";
			score: number;
	  }
	| {
			mediaType: "movie";
			tmdbId: number;
			method: "hint" | "release-date" | "title" | "continuation";
			score: number;
	  };

/**
 * The lowest score {@link placeInShow} accepts.
 *
 * A same-day start alone clears it; a start a week off needs a matching end
 * date or a prequel to back it up.
 */
const minimumShowScore = 70;

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

/**
 * A title-only film match may still differ this much in release date, which
 * covers festival premieres ahead of the theatrical run but not a bonus short
 * released months after its film.
 */
const releaseWindowDays = 120;

/**
 * Scores how alike two titles are, from 0 to 1.
 *
 * Uses the Sørensen–Dice coefficient over character bigrams of normalised
 * titles, which tolerates reordered words, romanisation differences, and
 * subtitles, and works for Japanese titles without tokenisation.
 */
export const titleSimilarity = (left: string, right: string) => {
	const a = new TitleText(left).bigrams;
	const b = new TitleText(right).bigrams;

	if (a.size === 0 || b.size === 0) {
		return 0;
	}

	let shared = 0;

	for (const [gram, count] of a) {
		shared += Math.min(count, b.get(gram) ?? 0);
	}

	const total = [...a.values(), ...b.values()].reduce((sum, count) => sum + count, 0);

	return (2 * shared) / total;
};

/**
 * The highest similarity between any title in `left` and any in `right`.
 *
 * @param options.sameNumbers - Only compare pairs that contain the same
 *   numbers, so "Infinity Castle" never matches "Infinity Castle 2" however
 *   alike the rest of the title is.
 */
export const bestSimilarity = (
	left: readonly string[],
	right: readonly string[],
	options: {
		sameNumbers?: boolean;
	} = {},
) => {
	let best = 0;

	for (const a of left) {
		for (const b of right) {
			if (!options.sameNumbers || new TitleText(a).numbers === new TitleText(b).numbers) {
				best = Math.max(best, titleSimilarity(a, b));
			}
		}
	}

	return best;
};

/**
 * Finds where an AniList entry sits in one TMDB show; see {@link placeInShow}.
 *
 * Regular seasons are treated as one continuous sequence, since an AniList
 * entry may cover several TMDB seasons (Naruto Shippuden) or share one with
 * other entries (Re:Zero keeps every cour in a single TMDB season). Specials
 * (season 0) form a separate sequence in which unrelated extras are
 * interleaved by release date, so there episodes of the wrong length are
 * skipped rather than claimed.
 */
class ShowMatch {
	/** The entry as AniList describes it. */
	readonly #source: MatchSubject;

	/** The entry with AniKoto's playable count as its episode count, when known. */
	readonly #subject: MatchSubject;

	readonly #candidate: ShowCandidate;
	readonly #start: number | null;
	readonly #end: number | null;
	readonly #nameSimilarity: number;

	constructor(source: MatchSubject, candidate: ShowCandidate) {
		this.#source = source;

		this.#subject = {
			...source,
			episodes: source.playbackEpisodes ?? source.episodes,
		};

		this.#candidate = candidate;
		this.#start = new AirDate(this.#subject.startDate).day;
		this.#end = new AirDate(this.#subject.endDate).day;

		this.#nameSimilarity = bestSimilarity(this.#subject.titles, [
			candidate.show.name,
			candidate.show.originalName,
		]);
	}

	/**
	 * The best-scoring placement, or `null` when nothing reaches
	 * {@link minimumShowScore}.
	 *
	 * Specials, OVAs, and movies are looked for among TMDB's specials, or as
	 * the start of a show that TMDB lists for the OVA on its own; a one-off
	 * airing the same week as a regular episode is not that episode.
	 */
	get placement(): Placement | null {
		const candidate = this.#candidate;
		const episodes = new EpisodeTrack(candidate.show.episodes);
		const tracks = [episodes.regular, episodes.specials];

		let best: Placement | null = null;

		for (const track of tracks) {
			const isRegular = track[0] !== undefined && track[0].season_number > 0;

			const { prequel } = candidate;
			const follows = isRegular && prequel && !this.#airsLate(track, prequel.first);
			let continuation: number | null = null;

			if (follows) {
				continuation = new EpisodeTrack(track).after(prequel.last);
			}

			for (const index of this.#starts(track, continuation)) {
				if (continuation !== null && index < continuation) {
					// The prequel already occupies these episodes.
					continue;
				}

				const placement = this.#runAt(track, isRegular, index, index === continuation);

				if (placement && placement.score > (best?.score ?? Number.NEGATIVE_INFINITY)) {
					best = placement;
				}
			}
		}

		return (
			best ??
			this.#compiledShorts() ??
			this.#byTitle() ??
			this.#withinBroadcast() ??
			this.#delayedStreaming() ??
			this.#specialByTitle() ??
			this.#specialsByEnd()
		);
	}

	/** Whether the entry's format runs as a series of episodes and may be a regular TMDB season. */
	get #episodic(): boolean {
		const { format } = this.#subject;

		return format === "TV" || format === "TV_SHORT" || format === "ONA" || format === null;
	}

	/** Whether the entry's primary titles and the show's names agree, numbers included. */
	get #namesAgree(): boolean {
		const subject = this.#subject;
		const { show } = this.#candidate;

		return (
			bestSimilarity(
				subject.titles.slice(0, subject.primaryTitleCount),
				[show.name, show.originalName],
				{
					sameNumbers: true,
				},
			) >= 0.9
		);
	}

	static #startScore(offset: number | null, isContinuation: boolean): number {
		if (offset === null) {
			if (isContinuation) {
				return 60;
			}

			return 0;
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

		if (distance <= startWindowDays) {
			return 30;
		}

		return 0;
	}

	#endScore(lastAirDay: number | null): number {
		const end = this.#end;

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

		if (distance <= 30) {
			return 0;
		}

		return -40;
	}

	/**
	 * Whether a prequel's first episode aired well after the subject started.
	 * AniList orders prequels by story, so a prequel told later, such as Yuki
	 * Yuna is a Hero's Washio Sumi chapter, can air a season after the entry it
	 * precedes; it then occupies nothing before that entry.
	 */
	#airsLate(track: readonly TmdbEpisode[], first: TmdbEpisodeRef): boolean {
		const start = this.#start;
		const episode = track[new EpisodeTrack(track).position(first)];
		const airDay = new AirDate(episode?.air_date ?? null).day;

		return airDay !== null && start !== null && airDay - start > startWindowDays;
	}

	/**
	 * Candidate start positions: episodes airing near the subject's start date,
	 * plus the episode right after the prequel. Only the first episode of each
	 * air date is a start, because simultaneous releases are one batch.
	 */
	#starts(track: readonly TmdbEpisode[], continuation: number | null): Set<number> {
		const start = this.#start;
		const indexes = new Set<number>();

		if (continuation !== null && continuation < track.length) {
			indexes.add(continuation);
		}

		if (start !== null) {
			let previousDay: number | null = null;

			for (const [index, episode] of track.entries()) {
				const airDate = new AirDate(episode.air_date);
				const airDay = airDate.day;

				if (airDay !== previousDay && airDate.within(start, startWindowDays)) {
					indexes.add(index);
				}

				previousDay = airDay;
			}
		}

		return indexes;
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
	#startsOwnShow(track: readonly TmdbEpisode[], index: number): boolean {
		return (
			index === 0 &&
			!this.#candidate.isFranchiseShow &&
			new AirDate(track[index]?.air_date ?? null).within(this.#start, 1)
		);
	}

	/**
	 * Whether a run of episodes stops before one airing on `airDay`: it is past
	 * the entry's end and does not continue the broadcast of a counted series,
	 * or it follows a long break while neither the count nor the end is known.
	 */
	#endsRun(
		airDay: number | null,
		previousDay: number | null,
		end: number | null,
		countsEpisodes: boolean,
	): boolean {
		const isPastEnd = airDay !== null && end !== null && airDay > end + endGraceDays;

		const continuesBroadcast =
			airDay !== null && previousDay !== null && airDay - previousDay <= broadcastBreakDays;

		if (isPastEnd && !(countsEpisodes && continuesBroadcast)) {
			return true;
		}

		return (
			airDay !== null &&
			previousDay !== null &&
			this.#subject.episodes === null &&
			end === null &&
			airDay - previousDay > broadcastBreakDays
		);
	}

	/**
	 * Collects the episodes from `index` that belong to the subject: up to its
	 * episode count, and otherwise not past its end date. When both are unknown
	 * the run ends at the first long broadcast break.
	 *
	 * A TV or web series whose episode count is known keeps its count past the
	 * end date, up to a broadcast break: AniList counts a double premiere as two
	 * episodes on one day where TMDB lists them a week apart, so TMDB's last
	 * episode can air a week after AniList's end date (Witch Hat Atelier). An
	 * episode after a break past the end date belongs to a later broadcast,
	 * such as the next season when TMDB lists one episode fewer.
	 *
	 * Regular seasons are taken as a contiguous run. Among specials, episodes of
	 * the wrong length are skipped, since TMDB interleaves unrelated extras.
	 */
	#pick(
		track: readonly TmdbEpisode[],
		index: number,
		end: number | null,
		isRegular: boolean,
	): TmdbEpisode[] {
		const subject = this.#subject;
		const countsEpisodes = isRegular && this.#episodic && subject.episodes !== null;
		const picked: TmdbEpisode[] = [];
		let previousDay: number | null = null;

		for (const episode of track.slice(index)) {
			if (subject.episodes !== null && picked.length >= subject.episodes) {
				break;
			}

			const airDay = new AirDate(episode.air_date).day;

			if (this.#endsRun(airDay, previousDay, end, countsEpisodes)) {
				break;
			}

			if (
				!isRegular &&
				!new Runtime(episode.runtime).agrees(subject.durationMinutes, specialsRuntimeTolerance)
			) {
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

	/**
	 * AniList episodes beyond the end of a regular run that TMDB lists as
	 * specials, such as Bakemonogatari's last three episodes, which were
	 * released online months after the broadcast. They are the specials of the
	 * right length airing after the run and before the entry ends.
	 */
	#overflow(picked: readonly TmdbEpisode[]): TmdbEpisode[] {
		const subject = this.#subject;
		const end = this.#end;
		let missing = 0;

		if (subject.episodes !== null) {
			missing = subject.episodes - picked.length;
		}

		const lastAirDay = new AirDate(picked.at(-1)?.air_date ?? null).day;

		const unplaceable = missing <= 0 || end === null || lastAirDay === null;

		if (unplaceable) {
			return [];
		}

		return new EpisodeTrack(this.#candidate.show.episodes).specials
			.filter((episode) => {
				const airDay = new AirDate(episode.air_date).day;

				return (
					airDay !== null &&
					airDay > lastAirDay &&
					airDay <= end + endGraceDays &&
					new Runtime(episode.runtime).agrees(subject.durationMinutes, specialsRuntimeTolerance)
				);
			})
			.slice(0, missing);
	}

	/**
	 * An extra leading episode AniList counts before TMDB's first matching one,
	 * such as an "episode 0" that TMDB files under specials, making AniList's
	 * second episode TMDB's first.
	 *
	 * TMDB's run starting about a week after AniList's is not enough on its own,
	 * since TMDB's premiere date is sometimes just a later broadcast of the same
	 * first episode (Overgeared). The extra episode must also show: TMDB lists it
	 * as a special on AniList's start date, or AniList counts exactly one episode
	 * more than TMDB's run.
	 *
	 * @returns The leading episode, with its TMDB special when TMDB lists one, or
	 *   `null` when AniList's first episode is TMDB's first.
	 */
	#leading(
		picked: readonly TmdbEpisode[],
		startOffset: number | null,
	): {
		special: TmdbEpisode | null;
	} | null {
		const subject = this.#subject;
		const startsLate = startOffset !== null && startOffset >= 5 && startOffset <= startWindowDays;

		if (!startsLate) {
			return null;
		}

		// The special that is AniList's leading "episode 0": aired on the entry's
		// start date, a week before TMDB's first regular episode of it.
		const special =
			new EpisodeTrack(this.#candidate.show.episodes).specials.find((episode) =>
				new AirDate(episode.air_date).within(this.#start, 1),
			) ?? null;

		if (special) {
			return {
				special,
			};
		}

		if (subject.episodes !== null && picked.length === subject.episodes - 1) {
			return {
				special: null,
			};
		}

		return null;
	}

	/**
	 * The episodes run from `index` of a track that could be the entry's, with
	 * the first and last of them; `null` when they cannot be.
	 */
	#runFrom(
		track: readonly TmdbEpisode[],
		isRegular: boolean,
		index: number,
		isContinuation: boolean,
	) {
		const subject = this.#subject;

		const mayTakeRegular =
			this.#episodic ||
			this.#startsOwnShow(track, index) ||
			// An OVA series continuing its franchise's show must also air when
			// that episode did; an OVA released between seasons is not the next season.
			(isContinuation &&
				new AirDate(track[index]?.air_date ?? null).within(this.#start, startWindowDays));

		if (isRegular && !mayTakeRegular) {
			return null;
		}

		const picked = this.#pick(track, index, this.#end, isRegular);

		if (isRegular) {
			picked.push(...this.#overflow(picked));
		}

		const isPartialOva =
			!this.#episodic && subject.episodes !== null && picked.length < subject.episodes;

		if (isRegular && isPartialOva) {
			// An OVA released all at once cannot be a run of weekly episodes
			// that mostly air after it ended.
			return null;
		}

		const [first] = picked;
		const last = picked.at(-1);

		if (first && new AirDate(first.air_date).before(subject.airsFrom)) {
			// A season that has not aired yet cannot be episodes that have.
			return null;
		}

		const isWrongLength =
			isRegular &&
			!new Runtime(new EpisodeTrack(picked).medianRuntime).agrees(
				subject.durationMinutes,
				regularRuntimeTolerance,
			);

		if (!first || !last) {
			return null;
		}

		if (isWrongLength) {
			return null;
		}

		return {
			first,
			last,
			picked,
		};
	}

	/**
	 * The placement of the run from `index` of a track, when it could be the
	 * entry's and scores at least {@link minimumShowScore}; else `null`.
	 */
	#runAt(
		track: readonly TmdbEpisode[],
		isRegular: boolean,
		index: number,
		isContinuation: boolean,
	): Placement | null {
		const subject = this.#subject;
		const candidate = this.#candidate;
		const start = this.#start;
		const run = this.#runFrom(track, isRegular, index, isContinuation);

		if (!run) {
			return null;
		}

		const { first, last, picked } = run;
		const firstAirDay = new AirDate(first.air_date).day;
		const lastAirDay = new AirDate(last.air_date).day;
		let startOffset: number | null = null;

		if (start !== null && firstAirDay !== null) {
			startOffset = firstAirDay - start;
		}

		let continuationBonus = 0;

		if (isContinuation) {
			continuationBonus = 40;
		}

		const evidence =
			ShowMatch.#startScore(startOffset, isContinuation) +
			continuationBonus +
			this.#endScore(lastAirDay);

		let coverage = 1;

		if (subject.episodes) {
			coverage = Math.min(picked.length / subject.episodes, 1);
		}

		let regularBonus = 0;

		if (isRegular) {
			regularBonus = 10;
		}

		let franchiseBonus = 0;

		if (candidate.isFranchiseShow) {
			franchiseBonus = 25;
		}

		const score =
			evidence * (0.5 + 0.5 * coverage) + regularBonus + franchiseBonus + 20 * this.#nameSimilarity;

		if (score < minimumShowScore) {
			return null;
		}

		let leading: {
			special: TmdbEpisode | null;
		} | null = null;

		if (isRegular) {
			leading = this.#leading(picked, startOffset);
		}

		const links: EpisodeLink[] = [];

		if (leading?.special) {
			links.push(...new EpisodeTrack([leading.special]).links());
		}

		let firstNumber = 1;

		if (leading) {
			firstNumber = 2;
		}

		links.push(...new EpisodeTrack(picked).links(firstNumber));

		let method: "air-date" | "continuation" = "continuation";

		if (startOffset !== null && Math.abs(startOffset) <= startWindowDays) {
			method = "air-date";
		}

		const placement: Placement = {
			episodes: links,
			mediaType: "tv",
			method,
			score,
			tmdbId: candidate.show.id,
		};

		return placement;
	}

	/**
	 * The counts that tell a show may compile the entry's shorts, when the
	 * entry's format, counts, and primary title allow it: its episodes are a
	 * whole multiple of the episodes AniKoto carries.
	 */
	#compilationCounts() {
		const subject = this.#source;
		const { show } = this.#candidate;
		const { durationMinutes, episodes, playbackEpisodes } = subject;

		const notShort =
			subject.format !== "TV_SHORT" || !episodes || !playbackEpisodes || !durationMinutes;

		if (notShort) {
			return null;
		}

		if (episodes <= playbackEpisodes || episodes % playbackEpisodes !== 0) {
			return null;
		}

		const similarity = bestSimilarity(subject.titles.slice(0, subject.primaryTitleCount), [
			show.name,
			show.originalName,
		]);

		if (similarity < 0.95) {
			return null;
		}

		return {
			durationMinutes,
			episodes,
			playbackEpisodes,
		};
	}

	/**
	 * One season of a show as the compilation of the entry's shorts: exactly the
	 * episodes AniKoto carries, numbered from 1, each with a runtime, starting
	 * and ending within the start window of the entry's dates.
	 */
	#compiledSeason(season: number, playbackEpisodes: number): TmdbEpisode[] | null {
		const subject = this.#source;

		const run = new EpisodeTrack(this.#candidate.show.episodes).regular.filter(
			(episode) => episode.season_number === season,
		);

		const [first] = run;
		const last = run.at(-1);
		const startOffset = new AirDate(subject.startDate).offset(first?.air_date ?? null);
		const endOffset = new AirDate(subject.endDate).offset(last?.air_date ?? null);

		const mismatched =
			!first ||
			!last ||
			run.length !== playbackEpisodes ||
			run.some((episode, index) => episode.episode_number !== index + 1 || !episode.runtime) ||
			new AirDate(first.air_date).before(subject.airsFrom) ||
			startOffset === null ||
			startOffset > startWindowDays ||
			endOffset === null ||
			endOffset > startWindowDays;

		if (mismatched) {
			return null;
		}

		return run;
	}

	/**
	 * Short broadcasts may be bundled into the full episodes AniKoto carries.
	 * Require the same primary title, a complete TMDB season with AniKoto's count,
	 * matching broadcast dates, and a matching total runtime. Never infer a bundle
	 * solely from a similar title or a shorter provider listing.
	 */
	#compiledShorts(): Placement | null {
		const candidate = this.#candidate;
		const counts = this.#compilationCounts();

		if (!counts) {
			return null;
		}

		const placements: Placement[] = [];
		const seasons = new Set(candidate.show.episodes.map((episode) => episode.season_number));

		for (const season of seasons) {
			if (season <= 0) {
				continue;
			}

			const run = this.#compiledSeason(season, counts.playbackEpisodes);

			if (!run) {
				continue;
			}

			const minutes = run.reduce((total, episode) => total + (episode.runtime ?? 0), 0);

			if (!new Runtime(minutes).agrees(counts.episodes * counts.durationMinutes, 1.2)) {
				continue;
			}

			placements.push({
				episodes: new EpisodeTrack(run).links(),
				mediaType: "tv",
				method: "compilation",
				score: 180,
				tmdbId: candidate.show.id,
			});
		}

		if (placements.length === 1) {
			return placements[0] ?? null;
		}

		return null;
	}

	/**
	 * Whether a first season started when the entry did: within a month of its
	 * start (four months for ONAs), or, for a whole show, in the same year.
	 */
	#startsAlike(
		track: readonly TmdbEpisode[],
		regularCount: number,
		offset: number | null,
	): boolean {
		const subject = this.#subject;
		let windowDays = 31;

		if (subject.format === "ONA") {
			windowDays = 120;
		}

		if (offset !== null && offset <= windowDays) {
			return true;
		}

		const { year } = new AirDate(track[0]?.air_date ?? null);

		return (
			track.length === regularCount && year !== null && year === new AirDate(subject.startDate).year
		);
	}

	/**
	 * Matches an entire show, or its complete first season, by title and count.
	 * A first season must start within a month, or four months for streaming
	 * releases. A whole show's existing same-year fallback also covers older
	 * titles whose premiere dates disagree by more.
	 */
	#byTitle(): Placement | null {
		const subject = this.#subject;
		const candidate = this.#candidate;
		const { regular } = new EpisodeTrack(candidate.show.episodes);
		const firstSeason = regular[0]?.season_number;
		const track = regular.filter((episode) => episode.season_number === firstSeason);
		const offset = new AirDate(subject.startDate).offset(track[0]?.air_date ?? null);

		const followsPrequel =
			candidate.prequel &&
			new EpisodeTrack(track).position(candidate.prequel.last) !== -1 &&
			!this.#airsLate(regular, candidate.prequel.first);

		if (followsPrequel) {
			return null;
		}

		const matches =
			this.#episodic &&
			this.#nameSimilarity >= 0.9 &&
			(track.length === regular.length || this.#namesAgree) &&
			subject.episodes !== null &&
			track.length === subject.episodes &&
			track[0] !== undefined &&
			!new AirDate(track[0].air_date).before(subject.airsFrom) &&
			new Runtime(new EpisodeTrack(track).medianRuntime).agrees(
				subject.durationMinutes,
				regularRuntimeTolerance,
			) &&
			this.#startsAlike(track, regular.length, offset);

		if (!matches) {
			return null;
		}

		return {
			episodes: new EpisodeTrack(track).links(),
			mediaType: "tv",
			method: "title",
			score: minimumShowScore,
			tmdbId: candidate.show.id,
		};
	}

	/**
	 * Places an entry whose AniList dates cover a rerun, such as the 2009
	 * broadcast of The Melancholy of Haruhi Suzumiya, which started in April with
	 * the 2006 episodes and only reached its fourteen new ones in May. TMDB dates
	 * just those, so no episode airs within the start window.
	 *
	 * The show must carry the entry's name, and exactly as many regular episodes
	 * as the entry has must air from its start to its end date, one after the
	 * other. Any other number leaves no telling which of them are the entry's.
	 * Episodes its prequel already occupies are never taken.
	 */
	#withinBroadcast(): Placement | null {
		const subject = this.#subject;
		const candidate = this.#candidate;
		const start = this.#start;
		const end = this.#end;

		const unmatchable =
			!this.#episodic ||
			subject.episodes === null ||
			start === null ||
			end === null ||
			this.#nameSimilarity < 0.9;

		if (unmatchable) {
			return null;
		}

		const track = new EpisodeTrack(candidate.show.episodes).regular;
		const episodes = new EpisodeTrack(track);

		const run = track.filter((episode) => {
			const airDay = new AirDate(episode.air_date).day;

			return airDay !== null && airDay >= start && airDay <= end + endGraceDays;
		});

		const [first] = run;
		let index = -1;

		if (first) {
			index = track.indexOf(first);
		}

		const mismatched =
			!first ||
			run.length !== subject.episodes ||
			run.some((episode, offset) => track[index + offset] !== episode) ||
			new AirDate(first.air_date).before(subject.airsFrom) ||
			!new Runtime(new EpisodeTrack(run).medianRuntime).agrees(
				subject.durationMinutes,
				regularRuntimeTolerance,
			);

		if (mismatched) {
			return null;
		}

		let prequelFirst = -1;
		let prequelLast = -1;

		if (candidate.prequel) {
			prequelFirst = episodes.position(candidate.prequel.first);
			prequelLast = episodes.position(candidate.prequel.last);
		}

		const overlaps =
			prequelFirst !== -1 &&
			prequelLast !== -1 &&
			index <= prequelLast &&
			index + run.length > prequelFirst;

		if (overlaps) {
			return null;
		}

		return {
			episodes: new EpisodeTrack(run).links(),
			mediaType: "tv",
			method: "air-date",
			score: minimumShowScore,
			tmdbId: candidate.show.id,
		};
	}

	/**
	 * Streaming releases can precede the weekly TV dates TMDB records. Only
	 * continue a proven franchise run, within four months, taking the exact
	 * AniList count inside one TMDB season. Shift the end-date boundary by the
	 * same delay so a batch's release date does not cut off its TV broadcast.
	 */
	#delayedStreaming(): Placement | null {
		const subject = this.#subject;
		const candidate = this.#candidate;

		if (subject.format !== "ONA" || !candidate.isFranchiseShow) {
			return null;
		}

		if (!candidate.prequel || !subject.episodes) {
			return null;
		}

		const track = new EpisodeTrack(candidate.show.episodes).regular;
		const start = this.#start;
		const index = new EpisodeTrack(track).after(candidate.prequel.last);
		let first: TmdbEpisode | undefined;

		if (index !== null) {
			first = track[index];
		}

		const firstDay = new AirDate(first?.air_date ?? null).day;

		if (!first || index === null) {
			return null;
		}

		if (start === null || firstDay === null) {
			return null;
		}

		if (new AirDate(first.air_date).before(subject.airsFrom)) {
			return null;
		}

		const delay = firstDay - start;

		if (delay <= startWindowDays || delay > 120) {
			return null;
		}

		if (this.#airsLate(track, candidate.prequel.first)) {
			return null;
		}

		const end = this.#end;

		const run = track
			.slice(index)
			.filter((episode) => episode.season_number === first.season_number);

		let delayedEnd: number | null = null;

		if (end !== null) {
			delayedEnd = end + delay;
		}

		const picked = this.#pick(run, 0, delayedEnd, true);

		if (
			picked.length !== subject.episodes ||
			!new Runtime(new EpisodeTrack(picked).medianRuntime).agrees(
				subject.durationMinutes,
				regularRuntimeTolerance,
			)
		) {
			return null;
		}

		return {
			episodes: new EpisodeTrack(picked).links(),
			mediaType: "tv",
			method: "continuation",
			score: minimumShowScore + 25,
			tmdbId: candidate.show.id,
		};
	}

	/**
	 * Places a special or OVA among its franchise show's specials by name when
	 * the air dates disagree, as they do by months for OVAs bundled with manga
	 * volumes. The TMDB special must be named what the subject's title adds to
	 * the show's ("HAIKYU!! LAND VS. AIR" is "Land vs. Air") and air within a
	 * year of AniList's start. The subject's later episodes follow it among the
	 * specials.
	 */
	#specialByTitle(): Placement | null {
		const subject = this.#subject;
		const candidate = this.#candidate;

		/** Shorter distinctive names, such as "OVA" or "Extra", are too generic to match specials by. */
		const shortestName = 6;

		/** How far a special matched by name may air from AniList's start date. */
		const windowDays = 365;

		if (!candidate.isFranchiseShow || this.#episodic) {
			return null;
		}

		const showNames = [candidate.show.name, candidate.show.originalName].map(
			(name) => new TitleText(name).normalized,
		);

		const names = subject.titles
			.slice(0, subject.primaryTitleCount)
			.flatMap((title) => {
				const { normalized } = new TitleText(title);
				const showName = showNames.find((name) => normalized.startsWith(`${name} `));

				if (showName) {
					return [normalized.slice(showName.length + 1)];
				}

				return [];
			})
			.filter((name) => name.length >= shortestName);

		const track = new EpisodeTrack(candidate.show.episodes).specials;
		const start = this.#start;

		const index = track.findIndex((episode) => {
			const airDay = new AirDate(episode.air_date).day;

			return (
				(start === null || airDay === null || Math.abs(airDay - start) <= windowDays) &&
				new Runtime(episode.runtime).agrees(subject.durationMinutes, specialsRuntimeTolerance) &&
				episode.name !== null &&
				bestSimilarity(names, [episode.name]) >= 0.9
			);
		});

		if (index === -1) {
			return null;
		}

		return {
			episodes: new EpisodeTrack(this.#pick(track, index, null, false)).links(),
			mediaType: "tv",
			method: "title",
			score: minimumShowScore,
			tmdbId: candidate.show.id,
		};
	}

	/**
	 * Places a run of episodes among its franchise show's specials by where it
	 * ends when the start dates disagree, as they do by weeks when TMDB dates a
	 * web series from a later release: TONIKAWA's High School Days began on
	 * 2023-07-12 per AniList, and TMDB's four specials air from 2023-08-02.
	 * Both end on 2023-08-23.
	 *
	 * The episode count decides it: the specials of the subject's length that
	 * aired while it ran must be exactly as many as it has episodes, and the
	 * last must air on AniList's end date. Any other number leaves no telling
	 * which of them are the subject's.
	 */
	#specialsByEnd(): Placement | null {
		const subject = this.#subject;
		const candidate = this.#candidate;
		const start = this.#start;
		const end = this.#end;

		if (!candidate.isFranchiseShow || subject.episodes === null) {
			return null;
		}

		if (subject.episodes < 2) {
			return null;
		}

		if (start === null || end === null) {
			return null;
		}

		const run = new EpisodeTrack(candidate.show.episodes).specials.filter((episode) => {
			const airDay = new AirDate(episode.air_date).day;

			return (
				airDay !== null &&
				airDay >= start &&
				airDay <= end + 1 &&
				new Runtime(episode.runtime).agrees(subject.durationMinutes, specialsRuntimeTolerance)
			);
		});

		const [first] = run;
		const lastAirDay = new AirDate(run.at(-1)?.air_date ?? null).day;

		const isWholeRun =
			first !== undefined &&
			run.length === subject.episodes &&
			lastAirDay !== null &&
			lastAirDay >= end - 1 &&
			!new AirDate(first.air_date).before(subject.airsFrom);

		if (!isWholeRun) {
			return null;
		}

		return {
			episodes: new EpisodeTrack(run).links(),
			mediaType: "tv",
			method: "air-date",
			score: minimumShowScore,
			tmdbId: candidate.show.id,
		};
	}
}

/**
 * Finds the best position for `subject` in a TMDB show.
 *
 * Regular seasons are treated as one continuous sequence, and specials as a
 * separate one; see {@link ShowMatch}.
 *
 * @returns The best-scoring placement, or `null` when nothing reaches
 *   {@link minimumShowScore}.
 */
export const placeInShow = (source: MatchSubject, candidate: ShowCandidate): Placement | null =>
	new ShowMatch(source, candidate).placement;

/**
 * Matches named TMDB arcs or release parts against primary AniList titles.
 * Consecutive numbered parts may combine when AniList combines their count.
 * Conflicting arrangements stay unresolved instead of choosing an order.
 */
export const placeInGroups = (
	source: MatchSubject,
	show: Pick<TmdbShow, "id" | "episodes">,
	arrangements: readonly (readonly TmdbEpisodeGroup[])[],
): Placement | null => {
	const subject = {
		...source,
		episodes: source.playbackEpisodes ?? source.episodes,
	};

	if (!subject.episodes) {
		return null;
	}

	const placements = new Map<string, Placement>();

	for (const groups of arrangements) {
		const arrangement = new Arrangement(groups);

		for (const [index, group] of groups.entries()) {
			const similarity = bestSimilarity(
				subject.titles.slice(0, subject.primaryTitleCount),
				[group.name],
				{ sameNumbers: true },
			);

			if (similarity < 0.95) {
				continue;
			}

			const episodes = arrangement.combined(index, subject.episodes);
			const [first] = episodes;

			if (!first || episodes.length !== subject.episodes) {
				continue;
			}

			if (
				new AirDate(first.air_date).before(subject.airsFrom) ||
				!new AirDate(subject.startDate).agrees(first.air_date, 365)
			) {
				continue;
			}

			const run = new EpisodeTrack(episodes);

			if (
				!new Runtime(run.medianRuntime).agrees(subject.durationMinutes, regularRuntimeTolerance)
			) {
				continue;
			}

			if (!run.canonicalIn(show.episodes)) {
				continue;
			}

			const links = run.links();
			placements.set(JSON.stringify(links), {
				episodes: links,
				mediaType: "tv",
				method: "episode-group",
				score: 200 + 20 * similarity,
				tmdbId: show.id,
			});
		}
	}

	if (placements.size === 1) {
		return [...placements.values()][0] ?? null;
	}

	return null;
};

/**
 * Decides whether a TMDB movie is the subject.
 *
 * A release within a month of AniList's start date plus a loosely similar
 * title is accepted, since franchises rarely release two films that close
 * together. Otherwise the titles must match nearly exactly, because bonus
 * shorts are often named after the film they accompany.
 *
 * A bonus short released with its film shares its date and much of its
 * title, such as Macross Frontier's three-minute Chou Jikuu Gekijou and The
 * Wings of Farewell, so a movie whose runtime is known must also run about
 * as long as the subject.
 *
 * @param hinted - Whether a TMDB hint names this movie for the subject.
 * @returns A placement, or `null` when the movie is not a confident match.
 */
export const placeAsMovie = (
	subject: MatchSubject,
	movie: Pick<TmdbMovieResult, "id" | "title" | "original_title" | "release_date"> & {
		runtime?: number | null;
	},
	hinted = false,
): Placement | null => {
	let subjectMinutes: number | null = null;

	if (subject.durationMinutes !== null) {
		subjectMinutes = subject.durationMinutes * (subject.episodes ?? 1);
	}

	if (!new Runtime(movie.runtime ?? null).agrees(subjectMinutes, regularRuntimeTolerance)) {
		return null;
	}

	// A hint names this film for this entry, so its date and title, which
	// differ when TMDB dates the film by its premiere, are not weighed.
	if (hinted) {
		return {
			mediaType: "movie",
			method: "hint",
			score: 200,
			tmdbId: movie.id,
		};
	}

	const movieTitles = [movie.title, movie.original_title];
	const similarity = bestSimilarity(subject.titles, movieTitles);
	const offset = new AirDate(subject.startDate).offset(movie.release_date);

	const released = offset !== null && offset <= 31;

	if (released && similarity >= 0.35) {
		return {
			mediaType: "movie",
			method: "release-date",
			score: 100 - offset + 60 * similarity,
			tmdbId: movie.id,
		};
	}

	// Synonyms often name the parent film, so a title-only match uses the
	// primary titles alone, and the titles must number the same instalment.
	const primarySimilarity = bestSimilarity(
		subject.titles.slice(0, subject.primaryTitleCount),
		movieTitles,
		{
			sameNumbers: true,
		},
	);

	if (
		primarySimilarity >= 0.92 &&
		new AirDate(subject.startDate).agrees(movie.release_date, releaseWindowDays)
	) {
		return {
			mediaType: "movie",
			method: "title",
			score: 30 + 60 * primarySimilarity,
			tmdbId: movie.id,
		};
	}

	return null;
};

/**
 * Places a sequel film as the film that follows its prequel in a TMDB
 * collection, for when the titles do not match: AniList often names an
 * unreleased film in romaji only ("Haikyuu!!: VS Chiisana Kyojin"), while
 * TMDB names it in English ("HAIKYU!! VS The Little Giant").
 *
 * The collection's films are ordered by release, undated ones last, and
 * the next one after the prequel must be released when the subject is,
 * as far as either date is known.
 *
 * @param prequelId - The TMDB movie the subject's direct prequel maps to.
 * @param parts - The films of the prequel's collection.
 */
export const placeAfterPrequel = (
	subject: MatchSubject,
	prequelId: number,
	parts: readonly TmdbMovieResult[],
): Placement | null => {
	const ordered = [...parts].toSorted(
		(left, right) =>
			(left.release_date ?? "9999").localeCompare(right.release_date ?? "9999") ||
			left.id - right.id,
	);

	const index = ordered.findIndex((part) => part.id === prequelId);
	let next: (typeof ordered)[number] | undefined;

	if (index !== -1) {
		next = ordered[index + 1];
	}

	if (!next) {
		return null;
	}

	if (new AirDate(subject.startDate).agrees(next.release_date, releaseWindowDays)) {
		return {
			mediaType: "movie",
			method: "continuation",
			score: minimumShowScore,
			tmdbId: next.id,
		};
	}

	return null;
};

/**
 * Whether a show lists regular episodes after the last one an entry's links
 * reach, in the same season: the entry gained episodes since it was matched,
 * as when the second of a double premiere reaches TMDB after the first.
 */
export const continuesPastLinks = (
	show: Pick<TmdbShow, "episodes">,
	links: readonly EpisodeLink[],
) => {
	const last = links.at(-1);

	return (
		last !== undefined &&
		last.seasonNumber > 0 &&
		show.episodes.some(
			(episode) =>
				episode.season_number === last.seasonNumber && episode.episode_number > last.episodeNumber,
		)
	);
};
