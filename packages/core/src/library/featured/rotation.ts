import { createHash } from "node:crypto";

import { day, hour } from "@sora/shared";

/** One AniList entry of a title, as the search index knows it. */
export interface FeaturedEntry {
	/** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, depending on what is known. */
	startDate: string | null;
	status: string | null;
	/** Weighted average score, 0–100. */
	score: number;
	popularity: number;
}

/**
 * What an entry must reach, at least, to be featured: well liked and widely
 * known, so that what leads the home page is what people are watching. An
 * airing entry is still gathering its audience, so it needs fewer users who
 * listed it.
 */
export const currentThresholds = {
	airingPopularity: 10_000,
	popularity: 30_000,
	score: 70,
};

/**
 * How recently an entry must have started to count as current, unless it is
 * still airing: a new season or film, never an old favourite.
 */
export const currentFor = 365 * day;

/**
 * How long an entry may have aired without end before its title counts as
 * long-running, such as Detective Conan or One Piece, which is never
 * featured: its newest episodes are not new to anyone.
 */
export const longRunningAfter = 3 * 365 * day;

/** How often the featured titles change: once a day. */
export const period = day;

/** When in the day they change, from the Unix epoch: 06:00 UTC, after the daily AniList trends are stored (05:30 UTC). */
const changeAt = 6 * hour;

/**
 * How many rotations of picks are remembered: longer than {@link freshFor},
 * so a title featured when its season ended is not featured again as if it
 * never had been.
 */
export const remembered = 35;

/** How many titles are featured: always this many, as long as that many can be shown. */
export const slideCount = 5;

/** Candidates kept beyond what is shown, so titles that turn out unsuitable, such as having nothing to stream, can be passed over. */
export const spareCandidates = 12;

/** How long after its last episode, or a film's release, a finished entry still counts as new. */
export const freshFor = 28 * day;

/**
 * How AniList activity is compared to tell a title people are coming back
 * to: the daily average of the last week against that of a week a month
 * ago.
 */
export const activityWindows = {
	past: {
		from: 35 * day,
		to: 28 * day,
	},
	recent: {
		from: 7 * day,
		to: 0,
	},
};

/** How many days of AniList activity are kept and read: enough for {@link activityWindows}. */
export const activityKeptFor = 36 * day;

/**
 * How much more activity a title must see now than a month ago to count as
 * rising, and how much at least, so a title few people talk about does not
 * rise on a handful of posts.
 */
export const rising = {
	minimumDaily: 200,
	ratio: 1.25,
};

/**
 * How much daily AniList activity a title needs, at least, to count as
 * popular right now, whether or not it is airing: about what a season that
 * finished in the last few months and is still widely watched sees, such as
 * Daemons of the Shadow Realm or Slime's fourth season, against well under
 * this for most others.
 */
export const popularDaily = 300;

/** How long a rising title rests after it was featured, while it has nothing else new. */
export const risingRestFor = 7 * day;

/** A date `ms` before `now`, as `YYYY-MM-DD`, to compare with the search index's start dates. */
export const dateBefore = (now: Date, ms: number) =>
	new Date(now.getTime() - ms).toISOString().slice(0, 10);

/**
 * Whether an entry is current: well liked and popular, and either still
 * airing or started within {@link currentFor}.
 */
export const isCurrent = (entry: FeaturedEntry, now: Date) => {
	if (entry.score < currentThresholds.score) {
		return false;
	}

	if (entry.status === "RELEASING") {
		return entry.popularity >= currentThresholds.airingPopularity;
	}

	return (
		entry.popularity >= currentThresholds.popularity &&
		entry.startDate !== null &&
		entry.startDate >= dateBefore(now, currentFor)
	);
};

/** The number of the rotation `now` falls in, counted in {@link period}s since the first. */
export const numberOf = (now: Date) => Math.floor((now.getTime() - changeAt) / period);

/** When `rotation` starts. */
export const startOf = (rotation: number) => new Date(rotation * period + changeAt);

/** One day of AniList activity of an entry. */
export interface ActivityDay {
	/** `YYYY-MM-DD`. */
	day: string;
	trending: number;
}

/** An entry's daily AniList activity, averaged over each of {@link activityWindows}; `null` where too few days are known. */
export interface Activity {
	past: number | null;
	recent: number | null;
}

/** The average daily activity of `days` in each of {@link activityWindows} before `now`. */
export const activityOf = (days: readonly ActivityDay[], now: Date): Activity => {
	/** Days of activity each window needs before it is trusted. */
	const minimumDays = 3;

	const average = ({ from, to }: { from: number; to: number }) => {
		const first = dateBefore(now, from);
		const last = dateBefore(now, to);
		const inside = days.filter((entry) => entry.day >= first && entry.day < last);

		if (inside.length < minimumDays) {
			return null;
		}

		return inside.reduce((sum, entry) => sum + entry.trending, 0) / inside.length;
	};

	return {
		past: average(activityWindows.past),
		recent: average(activityWindows.recent),
	};
};

/** Whether people talk about a title noticeably more now than a month ago. */
export const isRising = ({ past, recent }: Activity) =>
	past !== null &&
	recent !== null &&
	recent >= rising.minimumDaily &&
	recent >= past * rising.ratio;

/**
 * How well a title suits a profile's taste, as a factor on how often it is
 * drawn: the share of the profile's genre weights (see `Taste.weights`) its
 * genres cover. 1 for a profile that has watched nothing yet, or a title
 * sharing nothing with it; more for one it likes; less, down to a
 * quarter, for one in genres it dropped or rated low.
 */
export const affinityOf = (genres: readonly string[], weights: ReadonlyMap<string, number>) => {
	/**
	 * How strongly a profile's taste steers which titles it is shown: a title
	 * whose genres cover all of what the profile watches is drawn this much
	 * more often than one sharing none of them.
	 */
	const strength = 3;

	/** The least a title can weigh in a draw, so one in genres the profile seems to dislike can still lead the page when little else can. */
	const minimum = 0.25;

	let total = 0;

	for (const weight of weights.values()) {
		total += Math.max(0, weight);
	}

	if (total === 0) {
		return 1;
	}

	const shared = genres.reduce((sum, genre) => sum + (weights.get(genre) ?? 0), 0);

	return Math.max(minimum, 1 + (strength * shared) / total);
};

/** A title that may be featured, with what tells whether it has something new to show. */
export interface Candidate {
	id: string;
	/** How well it suits the profile's taste; see {@link affinityOf}. */
	affinity: number;
	status: string | null;
	startDate: string | null;
	/** When its newest episode aired, if any has and AniList schedules them. */
	lastAiredAt: Date | null;
	activity: Activity;
	/** When the rotation it was last featured in started; `null` when it has not been featured lately. */
	lastPickedAt: Date | null;
}

/** Why a title is worth featuring now. */
export type Reason = "airing" | "fresh" | "popular" | "rising";

/**
 * Why a title is worth featuring now: it is airing, it finished or came out
 * within {@link freshFor}, many people watch it right now (see
 * {@link popularDaily}), or people are coming back to it (see
 * {@link isRising}). A title with none of these, such as a season that ended
 * months ago and is past its moment, is featured only when too few others
 * can be; see {@link order}.
 */
export const reasonsOf = (candidate: Candidate, now: Date): Reason[] => {
	const reasons: Reason[] = [];

	if (candidate.status === "RELEASING") {
		reasons.push("airing");
	}

	const { lastAiredAt, startDate } = candidate;
	const airedLately = lastAiredAt !== null && now.getTime() - lastAiredAt.getTime() <= freshFor;

	const startedLately =
		lastAiredAt === null && startDate !== null && startDate >= dateBefore(now, freshFor);

	const isFresh = airedLately || startedLately;

	if (candidate.status !== "RELEASING" && isFresh) {
		reasons.push("fresh");
	}

	if ((candidate.activity.recent ?? 0) >= popularDaily) {
		reasons.push("popular");
	}

	if (isRising(candidate.activity)) {
		reasons.push("rising");
	}

	return reasons;
};

/**
 * Whether a title has something new since it was last featured: an episode
 * aired after that, or it is rising and was last featured over a week ago.
 * A title never featured lately always has.
 */
export const hasNews = (candidate: Candidate, now: Date) => {
	const { lastPickedAt, lastAiredAt } = candidate;

	if (lastPickedAt === null) {
		return true;
	}

	if (lastAiredAt !== null && lastAiredAt > lastPickedAt) {
		return true;
	}

	return isRising(candidate.activity) && now.getTime() - lastPickedAt.getTime() >= risingRestFor;
};

/**
 * Shuffles candidates anew for each `seed` and rotation, each profile in its
 * own order, the more talked-about ones and those that suit the profile's
 * taste more likely first: an Efraimidis–Spirakis draw with a seeded number
 * in place of a random one.
 */
export const shuffle = (
	candidates: readonly Candidate[],
	seed: string,
	rotation: number,
): Candidate[] =>
	candidates
		.map((candidate) => {
			// A well-spread 32-bit hash of the seed, rotation and title; not for security.
			const hash = createHash("sha1")
				.update(`${seed}:${rotation}:${candidate.id}`)
				.digest()
				.readUInt32BE(0);

			const draw = (hash + 1) / 2 ** 32;
			// More talked about, more often, without drowning out the rest.
			const weight = Math.sqrt((candidate.activity.recent ?? 0) + 25) * candidate.affinity;

			return {
				candidate,
				rank: -Math.log(draw) / weight,
			};
		})
		.toSorted((a, b) => a.rank - b.rank || a.candidate.id.localeCompare(b.candidate.id))
		.map(({ candidate }) => candidate);

/**
 * The order titles are tried in for a rotation, each group shuffled by
 * {@link shuffle}: those with a reason to be featured and something new
 * since they last were; then, in case too few of them can be shown, those
 * with a reason but nothing new, airing ones first, since a profile is
 * shown what airs ahead of what has finished; and last those without a
 * reason.
 */
export const order = (
	candidates: readonly Candidate[],
	seed: string,
	rotation: number,
	now: Date,
) => {
	const ids = (group: readonly Candidate[]) => shuffle(group, seed, rotation).map(({ id }) => id);
	const reasoned = candidates.filter((candidate) => reasonsOf(candidate, now).length > 0);
	const repeats = reasoned.filter((candidate) => !hasNews(candidate, now));

	return {
		news: ids(reasoned.filter((candidate) => hasNews(candidate, now))),
		repeats: [
			...ids(repeats.filter((candidate) => candidate.status === "RELEASING")),
			...ids(repeats.filter((candidate) => candidate.status !== "RELEASING")),
		],
		rest: ids(candidates.filter((candidate) => reasonsOf(candidate, now).length === 0)),
	};
};

/**
 * Titles `isUsable` accepts, as many as fill {@link slideCount} beside the
 * `shown` already featured this rotation: from `news` first, then from
 * `repeats`, then from `rest`.
 */
export const arrange = (
	{
		news,
		repeats,
		rest,
	}: {
		news: readonly string[];
		repeats: readonly string[];
		rest: readonly string[];
	},
	isUsable: (id: string) => boolean,
	shown = 0,
) =>
	[...new Set([...news, ...repeats, ...rest])]
		.filter(isUsable)
		.slice(0, Math.max(0, slideCount - shown));
