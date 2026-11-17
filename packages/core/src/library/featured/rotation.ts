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
export const rotationPeriod = day;

/** When in the day they change, from the Unix epoch: 06:00 UTC, after the daily AniList trends are stored (05:30 UTC). */
const rotationStart = 6 * hour;

/**
 * How many rotations of picks are remembered: longer than {@link freshFor},
 * so a title featured when its season ended is not featured again as if it
 * never had been.
 */
export const historyRotations = 35;

/** How many titles are featured, at most. */
export const featuredCount = 6;

/**
 * How few titles the carousel may hold before titles with nothing new since
 * they were last featured fill it, those featured longest ago first.
 */
export const minimumCount = 3;

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

/** How long a rising title rests after it was featured, while it has nothing else new. */
export const risingRestFor = 7 * day;

/** Days of activity each window needs before it is trusted. */
const minimumDaysPerWindow = 3;

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

/** The number of the rotation `now` falls in, counted in {@link rotationPeriod}s since the first. */
export const rotationOf = (now: Date) =>
	Math.floor((now.getTime() - rotationStart) / rotationPeriod);

/** When `rotation` starts. */
export const rotationStartOf = (rotation: number) =>
	new Date(rotation * rotationPeriod + rotationStart);

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
	const average = ({ from, to }: { from: number; to: number }) => {
		const first = dateBefore(now, from);
		const last = dateBefore(now, to);
		const inside = days.filter((entry) => entry.day >= first && entry.day < last);
		if (inside.length < minimumDaysPerWindow) {
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

/** A title that may be featured, with what tells whether it has something new to show. */
export interface Candidate {
	id: string;
	status: string | null;
	startDate: string | null;
	/** When its newest episode aired, if any has and AniList schedules them. */
	lastAiredAt: Date | null;
	activity: Activity;
	/** When the rotation it was last featured in started; `null` when it has not been featured lately. */
	lastPickedAt: Date | null;
}

/** Why a title is worth featuring now. */
export type Reason = "airing" | "fresh" | "rising";

/**
 * Why a title is worth featuring now: it is airing, it finished or came out
 * within {@link freshFor}, or people are coming back to it (see
 * {@link isRising}). A title with none of these, such as a season that ended
 * months ago and is past its moment, is not featured at all.
 */
export const reasonsOf = (candidate: Candidate, now: Date): Reason[] => {
	const reasons: Reason[] = [];
	if (candidate.status === "RELEASING") {
		reasons.push("airing");
	}
	const isFresh =
		candidate.lastAiredAt === null
			? candidate.startDate !== null && candidate.startDate >= dateBefore(now, freshFor)
			: now.getTime() - candidate.lastAiredAt.getTime() <= freshFor;
	if (candidate.status !== "RELEASING" && isFresh) {
		reasons.push("fresh");
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

/** A well-spread 32-bit hash of `text`; not for security. */
const hash = (text: string) => createHash("sha1").update(text).digest().readUInt32BE(0);

/** How often a title comes first, by its recent daily activity: more talked about, more often, without drowning out the rest. */
const weightOf = (candidate: Candidate) => Math.sqrt((candidate.activity.recent ?? 0) + 25);

/**
 * Shuffles candidates anew for each `seed` and rotation, each profile in its
 * own order, the more talked-about ones more likely first: an
 * Efraimidis–Spirakis draw with a seeded number in place of a random one.
 */
export const shuffle = (
	candidates: readonly Candidate[],
	seed: string,
	rotation: number,
): Candidate[] =>
	candidates
		.map((candidate) => {
			const draw = (hash(`${seed}:${rotation}:${candidate.id}`) + 1) / 2 ** 32;
			return {
				candidate,
				rank: -Math.log(draw) / weightOf(candidate),
			};
		})
		.toSorted((a, b) => a.rank - b.rank || a.candidate.id.localeCompare(b.candidate.id))
		.map(({ candidate }) => candidate);

/**
 * The order titles are tried in for a rotation: those with a reason to be
 * featured and something new since they last were, shuffled by
 * {@link shuffle}; then, in case too few of them can be shown, those with a
 * reason but nothing new, featured longest ago first. Titles without a
 * reason are left out.
 */
export const order = (
	candidates: readonly Candidate[],
	seed: string,
	rotation: number,
	now: Date,
) => {
	const reasoned = candidates.filter((candidate) => reasonsOf(candidate, now).length > 0);
	const news = reasoned.filter((candidate) => hasNews(candidate, now));
	const repeats = reasoned
		.filter((candidate) => !hasNews(candidate, now))
		.toSorted(
			(a, b) =>
				(a.lastPickedAt?.getTime() ?? 0) - (b.lastPickedAt?.getTime() ?? 0) ||
				a.id.localeCompare(b.id),
		);
	return {
		news: shuffle(news, seed, rotation).map(({ id }) => id),
		repeats: repeats.map(({ id }) => id),
	};
};

/**
 * Titles `isUsable` accepts from `news`, as many as fit beside the
 * `shown` already featured this rotation, then from `repeats` only as far as
 * needed to reach {@link minimumCount}.
 */
export const arrange = (
	{
		news,
		repeats,
	}: {
		news: readonly string[];
		repeats: readonly string[];
	},
	isUsable: (id: string) => boolean,
	shown = 0,
) => {
	const picked = [...new Set(news)].filter(isUsable).slice(0, Math.max(0, featuredCount - shown));
	const fill = Math.max(0, minimumCount - shown - picked.length);
	const extra = [...new Set(repeats)]
		.filter((id) => !picked.includes(id) && isUsable(id))
		.slice(0, fill);
	return [...picked, ...extra];
};
