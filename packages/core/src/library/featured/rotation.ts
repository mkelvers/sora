import { day, hour } from "../../time";

/**
 * Why a title is featured:
 *
 * - `fresh`: a season or film that came out in the last year and is well
 *   liked, so what is new keeps turning up.
 * - `acclaimed`: among the best rated, however popular, to discover.
 * - `popular`: a well-liked hit most people have heard of.
 */
export type FeaturedShelf = "fresh" | "acclaimed" | "popular";

/** One AniList entry of a title, as the search index knows it. */
export interface FeaturedEntry {
	/** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, depending on what is known. */
	startDate: string | null;
	/** Weighted average score, 0–100. */
	score: number;
	popularity: number;
}

/** What an entry must reach, at least, to put its title on each shelf. */
export const shelfThresholds = {
	fresh: {
		score: 75,
		popularity: 15_000,
	},
	acclaimed: {
		score: 83,
		popularity: 20_000,
	},
	popular: {
		score: 78,
		popularity: 100_000,
	},
} as const satisfies Record<
	FeaturedShelf,
	{
		score: number;
		popularity: number;
	}
>;

/** How recently an entry must have started to count as `fresh`. */
export const freshFor = 365 * day;

/**
 * How long an entry may have aired without end before its title counts as
 * long-running, such as Detective Conan or One Piece, which is never
 * featured: its newest episodes are not new to anyone.
 */
export const longRunningAfter = 3 * 365 * day;

/** How often the featured titles change: once a week. */
export const rotationPeriod = 7 * day;

/**
 * When in the week they change, from the Unix epoch, a Thursday: Monday at
 * 06:00 UTC, after the weekly full sync of the search index (Monday 02:20
 * UTC) has refreshed every entry's score and popularity.
 */
export const rotationStart = 4 * day + 6 * hour;

/** The shelf of each featured place, in order: mostly what is new, then some to discover. */
export const featuredPattern: readonly FeaturedShelf[] = [
	"fresh",
	"acclaimed",
	"fresh",
	"popular",
	"fresh",
	"acclaimed",
];

/** Candidates kept per place, so titles that turn out unsuitable, such as having nothing to stream, can be passed over. */
const sparesPerPlace = 3;

const shelfOrder: readonly FeaturedShelf[] = ["fresh", "acclaimed", "popular"];

/** A date `ms` before `now`, as `YYYY-MM-DD`, to compare with the search index's start dates. */
export function dateBefore(now: Date, ms: number) {
	return new Date(now.getTime() - ms).toISOString().slice(0, 10);
}

/**
 * The shelf a title's entries earn it, the first of `fresh`, `acclaimed`, and
 * `popular` any entry reaches; `null` when none does. Entries are expected to
 * have started airing.
 */
export function shelfOf(entries: readonly FeaturedEntry[], now: Date): FeaturedShelf | null {
	const freshSince = dateBefore(now, freshFor);
	const reaches = (entry: FeaturedEntry, shelf: FeaturedShelf) =>
		entry.score >= shelfThresholds[shelf].score &&
		entry.popularity >= shelfThresholds[shelf].popularity &&
		(shelf !== "fresh" || (entry.startDate !== null && entry.startDate >= freshSince));

	return shelfOrder.find((shelf) => entries.some((entry) => reaches(entry, shelf))) ?? null;
}

/** The number of the rotation `now` falls in, counted in {@link rotationPeriod}s since the first. */
export function rotationOf(now: Date) {
	return Math.floor((now.getTime() - rotationStart) / rotationPeriod);
}

/**
 * The candidates for each shelf in a rotation, in order: every rotation
 * shuffles each shelf anew for `seed`, so each profile sees its own order,
 * and takes a few candidates per place it fills, spares included.
 */
export function rotate(
	shelves: Readonly<Record<FeaturedShelf, readonly string[]>>,
	seed: string,
	rotation: number,
): Record<FeaturedShelf, string[]> {
	const window = (shelf: FeaturedShelf) => {
		const places = featuredPattern.filter((placed) => placed === shelf).length;
		return shelves[shelf]
			.map((id) => ({
				id,
				rank: hash(`${seed}:${rotation}:${id}`),
			}))
			.sort((a, b) => a.rank - b.rank || a.id.localeCompare(b.id))
			.slice(0, Math.max(places, 1) * sparesPerPlace)
			.map(({ id }) => id);
	};

	return {
		fresh: window("fresh"),
		acclaimed: window("acclaimed"),
		popular: window("popular"),
	};
}

/**
 * Fills {@link featuredPattern} from each shelf's candidates in order,
 * skipping those `isUsable` rejects. A place whose shelf has run out takes
 * the next usable candidate of any other, so the pattern stays full while
 * any candidate is left.
 */
export function arrange(
	candidates: Readonly<Record<FeaturedShelf, readonly string[]>>,
	isUsable: (id: string) => boolean,
): string[] {
	const queues = Object.fromEntries(
		shelfOrder.map((shelf) => [shelf, candidates[shelf].filter(isUsable)]),
	) as Record<FeaturedShelf, string[]>;
	const picked: string[] = [];
	const take = (shelf: FeaturedShelf) => {
		const queue = queues[shelf];
		while (queue.length > 0) {
			const id = queue.shift()!;
			if (!picked.includes(id)) {
				return id;
			}
		}
		return undefined;
	};

	for (const shelf of featuredPattern) {
		const id =
			take(shelf) ??
			shelfOrder.reduce<string | undefined>((found, other) => found ?? take(other), undefined);
		if (id === undefined) {
			break;
		}
		picked.push(id);
	}
	return picked;
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
