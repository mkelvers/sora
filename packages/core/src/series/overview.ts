import { eq } from "drizzle-orm";

import { placeholder, synopsis } from "../catalog/models/text";
import { getAnime } from "../catalog/queries/anime";
import { db } from "../database/client";
import { series } from "../database/schema/series";
import type { TmdbMovie, TmdbShow } from "../tmdb/resources";
import { loadByIds } from "./entries";
import type { FranchiseEntry } from "./entries";
import type { EpisodeLink } from "./matching";

/** The synopsis of an AniList entry laid out as a series. */
export class Overview {
	readonly #entry: FranchiseEntry;
	readonly #links: readonly EpisodeLink[];
	readonly #show: TmdbShow | null;
	readonly #film: TmdbMovie | null;

	/**
	 * @param movie - The TMDB film the entry is matched to, if any.
	 * @param episodeCount - How many episodes the entry is laid out with. A
	 *   film's synopsis describes the film, not a special of several episodes.
	 */
	constructor(
		entry: FranchiseEntry,
		links: readonly EpisodeLink[],
		show: TmdbShow | null,
		movie: TmdbMovie | null,
		episodeCount: number,
	) {
		this.#entry = entry;
		this.#links = links;
		this.#show = show;
		this.#film = null;

		if (episodeCount === 1) {
			this.#film = movie;
		}
	}

	/** TMDB's synopsis where it describes the entry, else AniList's. */
	async text() {
		return this.#tmdb ?? (await this.#anilist());
	}

	/**
	 * TMDB's synopsis where it describes the entry: a film's own, and a show's
	 * for the entry that opens the show. A later season, or a special, has only
	 * AniList's, since TMDB's synopsis of a show describes how it begins.
	 * Either is cut down to its premise (see {@link synopsis}).
	 */
	get #tmdb() {
		const opensShow = this.#links.some(
			(link) => link.seasonNumber === 1 && link.episodeNumber === 1,
		);

		let overview: string | null | undefined = null;

		if (opensShow) {
			overview = this.#show?.overview;
		}

		if (this.#film) {
			({ overview } = this.#film);
		}

		return (overview && synopsis(overview)) || null;
	}

	/**
	 * AniList's synopsis of the entry. One that only names the release, such as
	 * `Part 3 of Tensei Shitara Slime Datta Ken 4th Season.`, is swapped for
	 * TMDB's synopsis of the entry's season, else for the synopsis of how the
	 * story begins: TMDB's of the show, else that of the franchise's first
	 * release, found by AniList's prequels.
	 */
	async #anilist() {
		const entry = this.#entry;
		const show = this.#show;
		const anime = await getAnime(entry.id);
		const own = anime.description;

		if (own && !placeholder.test(own)) {
			return own;
		}

		const seasonNumber = this.#links.find((link) => link.seasonNumber > 0)?.seasonNumber;
		const season = show?.seasons.find((candidate) => candidate.seasonNumber === seasonNumber);

		if (season?.overview) {
			return synopsis(season.overview);
		}

		const first = await this.#firstRelease();
		let stored: { overview: string | null } | undefined;
		let firstDescription: string | null = null;

		if (first.id !== entry.id) {
			[stored] = await db
				.select({
					overview: series.overview,
				})
				.from(series)
				.where(eq(series.anilistId, first.id))
				.limit(1);

			const firstAnime = await getAnime(first.id);

			firstDescription = firstAnime.description;
		}

		const replacement =
			(show?.overview && synopsis(show.overview)) || stored?.overview || firstDescription;

		if (replacement && !placeholder.test(replacement)) {
			return replacement;
		}

		return own;
	}

	/** Where an entry falls among its franchise's releases, by its start date; unknown dates last. */
	static #order(entry: FranchiseEntry) {
		const date = entry.startDate;

		if (date?.year) {
			return date.year * 10_000 + (date.month ?? 0) * 100 + (date.day ?? 0);
		}

		return Number.MAX_SAFE_INTEGER;
	}

	/** The release the franchise starts with: the earliest prequel of the earliest prequel, and so on. */
	async #firstRelease() {
		const visited = new Set([this.#entry.id]);

		const earliestFrom = async (
			current: FranchiseEntry,
			depth: number,
		): Promise<FranchiseEntry> => {
			if (depth >= 12) {
				return current;
			}

			const ids = (current.relations?.edges ?? []).flatMap((edge) => {
				const node = edge?.node;

				if (edge?.relationType !== "PREQUEL" || node?.type !== "ANIME") {
					return [];
				}

				if (visited.has(node.id)) {
					return [];
				}

				return [node.id];
			});

			const loadedPrequels = await loadByIds(ids);
			const prequels = [...loadedPrequels.values()];

			const [earliest] = prequels.toSorted(
				(left, right) => Overview.#order(left) - Overview.#order(right) || left.id - right.id,
			);

			if (!earliest) {
				return current;
			}

			visited.add(earliest.id);

			return await earliestFrom(earliest, depth + 1);
		};

		return await earliestFrom(this.#entry, 0);
	}
}
