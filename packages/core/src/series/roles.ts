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

/** The titles on a franchise's main story path, and how AniList relates the franchise's titles. */
class MainPath {
	/** Anything but a direct sequel or prequel needs one of these to count as worth watching. */
	static readonly #worthwhileScore = 60;

	static readonly #continuationRelations = new Set<MediaRelation>(["SEQUEL", "PREQUEL"]);
	static readonly #sideStoryRelations = new Set<MediaRelation>(["SIDE_STORY", "PARENT"]);
	static readonly #spinOffRelations = new Set<MediaRelation>(["SPIN_OFF", "CHARACTER"]);
	static readonly #recapRelations = new Set<MediaRelation>(["SUMMARY", "COMPILATION"]);

	readonly #relations: readonly RoleRelation[];
	readonly #main: ReadonlySet<number>;

	constructor(relations: readonly RoleRelation[], main: ReadonlySet<number>) {
		this.#relations = relations;
		this.#main = main;
	}

	/** The role of `title`; see {@link classify}. */
	role(title: RoleTitle): FranchiseRole {
		const worthwhilePopularity = 2000;

		/** Total runtime, in minutes, under which an unconnected title is a clip. */
		const minimumRuntimeMinutes = 5;

		const relations = this.#relations;
		const main = this.#main;

		if (title.format === "MUSIC") {
			return "noise";
		}

		if (
			relations.some(({ to, type }) => to === title.anilistId && MainPath.#recapRelations.has(type))
		) {
			return "recap";
		}

		if (main.has(title.anilistId)) {
			return "season";
		}

		// How the main story lists the title, and how the title lists the main story.
		const listed = relations.flatMap(({ from, to, type }) => {
			if (to === title.anilistId && main.has(from)) {
				return [type];
			}

			return [];
		});

		const lists = relations.flatMap(({ from, to, type }): MediaRelation[] => {
			if (from !== title.anilistId || !main.has(to)) {
				return [];
			}

			if (type === "PARENT") {
				return ["SIDE_STORY"];
			}

			return [type];
		});

		const touching = [...listed, ...lists];

		if (touching.includes("ALTERNATIVE")) {
			return "alternative";
		}

		if (touching.some((type) => MainPath.#continuationRelations.has(type))) {
			return "extra";
		}

		let runtime: number | null = null;

		if (title.durationMinutes !== null) {
			runtime = title.durationMinutes * Math.max(title.episodeCount, 1);
		}

		const isClip = runtime !== null && runtime < minimumRuntimeMinutes;

		const isWorthwhile =
			(title.score ?? 0) >= MainPath.#worthwhileScore ||
			(title.popularity ?? 0) >= worthwhilePopularity;

		if (isClip || !isWorthwhile) {
			return "noise";
		}

		// A spin-off lists its original as `PARENT`, as a side story does, so the
		// main story's own listing decides between the two when it has one.
		let decisive = lists;

		if (listed.length > 0) {
			decisive = listed;
		}

		if (
			!decisive.some((type) => MainPath.#sideStoryRelations.has(type)) &&
			touching.some((type) => MainPath.#spinOffRelations.has(type))
		) {
			return "spin_off";
		}

		return "extra";
	}
}

/**
 * Gives every title exactly one {@link FranchiseRole}.
 *
 * `main` holds the AniList IDs already on the main story path (the seasons
 * {@link Franchise} lists). Everything else is decided by how AniList
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
 *    world or characters, and otherwise an `extra`. How the main story lists
 *    the title decides this over how the title lists the main story.
 */
export const classify = (
	titles: readonly RoleTitle[],
	relations: readonly RoleRelation[],
	main: ReadonlySet<number>,
): Map<number, FranchiseRole> => {
	const roles = new Map<number, FranchiseRole>();
	const path = new MainPath(relations, main);

	for (const title of titles) {
		roles.set(title.anilistId, path.role(title));
	}

	return roles;
};
