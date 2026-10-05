import { day, hour } from "../../time";

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
 * known, so that what leads the home page is what people are watching.
 */
export const currentThresholds = {
	score: 75,
	popularity: 60_000,
};

/**
 * How recently an entry must have started to count as current, unless it is
 * still airing: a new season or film, never an old favourite.
 */
export const currentFor = 180 * day;

/**
 * How long an entry may have aired without end before its title counts as
 * long-running, such as Detective Conan or One Piece, which is never
 * featured: its newest episodes are not new to anyone.
 */
export const longRunningAfter = 3 * 365 * day;

/** How often the featured titles change: once a day. */
export const rotationPeriod = day;

/** When in the day they change, from the Unix epoch: 06:00 UTC, after the weekly full sync of the search index (Monday 02:20 UTC). */
export const rotationStart = 6 * hour;

/** How many rotations back a featured title is rested, shown again only when too few others remain: a week. */
export const restRotations = 7;

/** How many titles are featured. */
export const featuredCount = 6;

/** Candidates kept beyond what is shown, so titles that turn out unsuitable, such as having nothing to stream, can be passed over. */
export const spareCandidates = 12;

/** A date `ms` before `now`, as `YYYY-MM-DD`, to compare with the search index's start dates. */
export function dateBefore(now: Date, ms: number) {
	return new Date(now.getTime() - ms).toISOString().slice(0, 10);
}

/**
 * Whether an entry is current: well liked and popular, and either still
 * airing or started within {@link currentFor}.
 */
export function isCurrent(entry: FeaturedEntry, now: Date) {
	return (
		entry.score >= currentThresholds.score &&
		entry.popularity >= currentThresholds.popularity &&
		(entry.status === "RELEASING" ||
			(entry.startDate !== null && entry.startDate >= dateBefore(now, currentFor)))
	);
}

/** The number of the rotation `now` falls in, counted in {@link rotationPeriod}s since the first. */
export function rotationOf(now: Date) {
	return Math.floor((now.getTime() - rotationStart) / rotationPeriod);
}

/**
 * Shuffles candidates anew for each `seed` and rotation, so each profile
 * sees its own order.
 */
export function rotate(ids: readonly string[], seed: string, rotation: number): string[] {
	return ids
		.map((id) => ({
			id,
			rank: hash(`${seed}:${rotation}:${id}`),
		}))
		.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
		.map(({ id }) => id);
}

/** The first {@link featuredCount} candidates `isUsable` accepts, in order. */
export function arrange(candidates: readonly string[], isUsable: (id: string) => boolean) {
	return [...new Set(candidates)].filter(isUsable).slice(0, featuredCount);
}

/** FNV-1a, a fast, well-spread 32-bit hash; not for security. */
function hash(text: string) {
	let value = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		value ^= text.charCodeAt(index);
		value = Math.imul(value, 0x01000193);
	}
	return value >>> 0;
}
