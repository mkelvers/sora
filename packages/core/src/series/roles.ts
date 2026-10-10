import type { MediaRelation } from "../anilist/graphql.generated";
import type { AnimeFormat } from "../catalog/models/anime";

/** What {@link franchiseRoles} needs to know about each title. */
export interface RoleTitle {
	anilistId: number;
	format: AnimeFormat | null;
	episodeCount: number;
	/** Minutes per episode; `null` when AniList does not say. */
	durationMinutes: number | null;
	/** Weighted average score, 0-100. */
	score: number | null;
	/** How many AniList users list the title. */
	popularity: number | null;
}

/** How AniList relates `to` to `from`, as stored in `series_related`. */
export interface RoleRelation {
	from: number;
	to: number;
	type: MediaRelation;
}

/**
 * Where a title belongs on its franchise's page.
 *
 * - `season`: the main story path.
 * - `extra`: a film, OVA, or special that continues or sits inside the story,
 *   or a worthwhile one-off that is not tied to it.
 * - `spin_off`: a story of its own that shares the world or characters.
 * - `recap`: a summary or compilation of titles that are already listed.
 * - `alternative`: another adaptation of a story the main path already tells.
 * - `noise`: music videos, clips, and titles too short or too little watched
 *   to be worth a reader's time.
 */
export type FranchiseRole = "season" | "extra" | "spin_off" | "recap" | "alternative" | "noise";

/** Total runtime, in minutes, under which an unconnected title is a clip. */
export const minimumRuntimeMinutes = 5;

/** Anything but a direct sequel or prequel needs one of these to count as worth watching. */
export const worthwhileScore = 60;
export const worthwhilePopularity = 2000;

const continuationRelations = new Set<MediaRelation>(["SEQUEL", "PREQUEL"]);
const sideStoryRelations = new Set<MediaRelation>(["SIDE_STORY", "PARENT"]);
const spinOffRelations = new Set<MediaRelation>(["SPIN_OFF", "CHARACTER"]);
const recapRelations = new Set<MediaRelation>(["SUMMARY", "COMPILATION"]);

/**
 * Gives every title exactly one {@link FranchiseRole}.
 *
 * `main` holds the AniList IDs already on the main story path (the seasons
 * {@link franchiseParts} lists). Everything else is decided by how AniList
 * relates it to them, then by format and runtime:
 *
 * 1. Music, and titles marked as another title's summary, are never listed.
 * 2. A title on the main path is a `season`.
 * 3. An alternative to a main title is an `alternative`.
 * 4. A sequel or prequel of a main title is an `extra`, however little it is
 *    rated: it continues the story.
 * 5. Anything else, linked or not, is `noise` unless it has a real runtime and
 *    is rated or watched enough. A runtime AniList does not give is not held
 *    against the title. What passes is a `spin_off` when it shares only the
 *    world or characters, and otherwise an `extra`.
 */
export function franchiseRoles(
	titles: readonly RoleTitle[],
	relations: readonly RoleRelation[],
	main: ReadonlySet<number>,
): Map<number, FranchiseRole> {
	const roles = new Map<number, FranchiseRole>();
	for (const title of titles) {
		roles.set(title.anilistId, roleOf(title, relations, main));
	}

	return roles;
}

function roleOf(
	title: RoleTitle,
	relations: readonly RoleRelation[],
	main: ReadonlySet<number>,
): FranchiseRole {
	if (title.format === "MUSIC") {
		return "noise";
	}

	if (relations.some(({ to, type }) => to === title.anilistId && recapRelations.has(type))) {
		return "recap";
	}

	if (main.has(title.anilistId)) {
		return "season";
	}

	const touching = relations.flatMap(({ from, to, type }) => {
		if (from === title.anilistId && main.has(to)) {
			return [type === "PARENT" ? "SIDE_STORY" : type];
		}

		if (to === title.anilistId && main.has(from)) {
			return [type];
		}

		return [];
	});
	if (touching.includes("ALTERNATIVE")) {
		return "alternative";
	}

	if (touching.some((type) => continuationRelations.has(type))) {
		return "extra";
	}

	const runtime =
		title.durationMinutes === null ? null : title.durationMinutes * Math.max(title.episodeCount, 1);
	const isClip = runtime !== null && runtime < minimumRuntimeMinutes;
	const isWorthwhile =
		(title.score ?? 0) >= worthwhileScore || (title.popularity ?? 0) >= worthwhilePopularity;
	if (isClip || !isWorthwhile) {
		return "noise";
	}

	return !touching.some((type) => sideStoryRelations.has(type)) &&
		touching.some((type) => spinOffRelations.has(type))
		? "spin_off"
		: "extra";
}
