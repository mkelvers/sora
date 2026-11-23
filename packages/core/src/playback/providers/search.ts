import { attempt, sequence } from "@sora/shared";
import { bestSimilarity } from "anime-sdk";
import type { HttpClient } from "anime-sdk";
import { and, eq, gte, inArray, lte, or } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { z } from "zod";

import type { Anime, AnimeFormat } from "../../catalog/models/anime";
import { getAnime } from "../../catalog/queries/anime";
import { db } from "../../database/client";
import { anikotoSeries } from "../../database/schema/playback";
import { AnimeNotFoundError } from "../../errors";
import { Rows } from "./rows";
import { Series } from "./series";

/** AniKoto's API, which serves its catalogue. */
export const apiUrl = "https://anikotoapi.site";

/**
 * How an anime was matched to its AniKoto series: by its own ID or title, or
 * as a `continuation` of its prequel's series, which AniKoto numbers on
 * through both.
 */
type MatchMethod = "id" | "title" | "continuation";

/** An anime's AniKoto series. */
export interface AniKotoMatch {
	anikotoId: string;
	title: string;
	method: MatchMethod;
	/**
	 * AniKoto episodes that belong to earlier parts: the anime's first episode
	 * is AniKoto's episode `episodeOffset + 1`. `0` unless `method` is
	 * `continuation`.
	 */
	episodeOffset: number;
}

type StoredSeries = typeof anikotoSeries.$inferSelect;

/**
 * A title reduced to lowercase letters and digits, keeping every word:
 * unlike `anime-sdk`'s `normalizeTitle`, "Season 2" stays, so a sequel never
 * equals its first season.
 */
export const strictTitle = (title: string) =>
	title
		.normalize("NFKD")
		.replaceAll(/\p{M}/gu, "")
		.toLowerCase()
		.replaceAll(/[^\p{L}\p{N}]+/gu, " ")
		.trim();

/** Looking for an anime's series in AniKoto's catalogue. */
export class Search {
	/** Formats one site may list as another: a TV short as TV, a web series as TV or OVA. */
	static readonly #episodicFormats = new Set<string>(["TV", "TV_SHORT", "ONA"]);
	static readonly #extraFormats = new Set<string>(["OVA", "SPECIAL", "ONA"]);

	readonly #anime: Anime;

	constructor(anime: Anime) {
		this.#anime = anime;
	}

	/**
	 * Finds the AniKoto series of the anime in the mirrored catalogue.
	 *
	 * AniKoto series that record the anime's AniList or MyAnimeList ID are the
	 * candidates. Those IDs are occasionally wrong or shared, as when a
	 * compilation film carries its show's IDs, so each candidate is scored on
	 * how well its format, episode count, year, and titles agree, and the best
	 * one wins. A candidate of another kind, such as a film for a TV show, is
	 * rejected outright.
	 *
	 * Without an ID match, only a series whose title is exactly one of the
	 * anime's, with the same format and year, is accepted, and only when it is
	 * the one such series. Closer-sounding titles are never guessed at: a sequel
	 * AniKoto does not carry yet would be matched to an earlier season.
	 *
	 * When the mirror has no match, as for a series AniKoto added since the last
	 * sync, AniKoto's search is asked for the anime's titles and the series it
	 * finds are added to the mirror and matched the same way.
	 *
	 * @returns The AniKoto series ID and how it was matched, or `null` when
	 *   AniKoto has no series for the anime.
	 * @throws {Error} when the mirror has no match and AniKoto's search fails.
	 */
	async find(http: HttpClient): Promise<AniKotoMatch | null> {
		/** How many prequels back a part may continue its series' AniKoto episodes. */
		const continuationDepth = 3;

		const stored = await this.#stored();

		if (stored) {
			return stored;
		}

		await this.#lookUp(http);

		return (await this.#stored()) ?? this.#continued(continuationDepth);
	}

	/**
	 * The candidate sharing an ID with the anime that agrees with it best, or
	 * `null` when every one is another kind of entry.
	 */
	best<TCandidate extends StoredSeries>(candidates: readonly TCandidate[]): TCandidate | null {
		let best: {
			candidate: TCandidate;
			score: number;
		} | null = null;

		for (const candidate of candidates) {
			const score = this.#score(candidate);

			const better = score !== null && (best === null || score > best.score);

			if (better) {
				best = {
					candidate,
					score,
				};
			}
		}

		return best?.candidate ?? null;
	}

	/** The anime's titles that it has. */
	get #titles() {
		const anime = this.#anime;

		return [anime.title.english, anime.title.romaji, anime.title.native, ...anime.synonyms].flatMap(
			(title) => {
				if (title) {
					return [title];
				}

				return [];
			},
		);
	}

	/** The year the anime aired in, if known. */
	get #year() {
		const anime = this.#anime;

		if (anime.seasonYear !== null) {
			return anime.seasonYear;
		}

		if (anime.startDate) {
			return Number(anime.startDate.slice(0, 4));
		}

		return null;
	}

	/**
	 * Scores how well the anime's format agrees with `candidate`: `3` when
	 * equal, `1` when one site files the other's kind of entry that way, `0`
	 * when either is unknown, and `null` when a film faces anything but a film.
	 */
	#agreement(candidate: string | null): number | null {
		const format: AnimeFormat | null = this.#anime.format;

		if (format === null || candidate === null) {
			return 0;
		}

		if (format === candidate) {
			return 3;
		}

		if (format === "MOVIE" || candidate === "MOVIE") {
			return null;
		}

		const alike =
			(Search.#episodicFormats.has(format) && Search.#episodicFormats.has(candidate)) ||
			(Search.#extraFormats.has(format) && Search.#extraFormats.has(candidate));

		if (alike) {
			return 1;
		}

		return -2;
	}

	/**
	 * How well a candidate that shares an ID with the anime agrees with it, or
	 * `null` when it is plainly another kind of entry.
	 */
	#score(candidate: StoredSeries): number | null {
		const anime = this.#anime;
		const formatScore = this.#agreement(candidate.format);

		if (formatScore === null) {
			return null;
		}

		const year = this.#year;
		const titles = this.#titles;
		let yearScore = 0;

		if (year !== null && candidate.year !== null) {
			yearScore = -2;

			if (Math.abs(candidate.year - year) <= 1) {
				yearScore = 1;
			}
		}

		const sameAnilist = Number(candidate.anilistId === anime.id) * 4;
		const sameMal = Number(anime.malId !== null && candidate.malId === anime.malId) * 4;

		const sameEpisodes =
			Number(anime.episodes !== null && candidate.episodes === anime.episodes) * 2;

		// AniKoto lists some series twice, once uncensored; the broadcast cut
		// is the one AniList describes.
		const uncensored = Number(/\buncensored\b/iu.test(candidate.title)) * 2;

		return (
			sameAnilist +
			sameMal +
			formatScore +
			sameEpisodes +
			yearScore +
			3 * Math.max(0, ...candidate.titles.map((title) => bestSimilarity(title, titles))) -
			uncensored
		);
	}

	/** Matches the anime against the mirrored catalogue only; see {@link Search.find}. */
	async #stored(): Promise<AniKotoMatch | null> {
		const anime = this.#anime;
		let byId: SQL | undefined = eq(anikotoSeries.anilistId, anime.id);

		if (anime.malId) {
			byId = or(eq(anikotoSeries.anilistId, anime.id), eq(anikotoSeries.malId, anime.malId));
		}

		const candidates = await db.select().from(anikotoSeries).where(byId);

		const best = this.best(candidates);

		if (best) {
			return {
				anikotoId: String(best.anikotoId),
				episodeOffset: 0,
				method: "id",
				title: best.title,
			};
		}

		// Series with exactly one of the anime's titles, the same format, and a
		// year no more than one apart.
		const year = this.#year;

		if (anime.format === null || year === null) {
			return null;
		}

		const titles = new Set(this.#titles.map(strictTitle).filter((title) => title.length > 0));

		const nearby = await db
			.select()
			.from(anikotoSeries)
			.where(
				and(
					eq(anikotoSeries.format, anime.format),
					gte(anikotoSeries.year, year - 1),
					lte(anikotoSeries.year, year + 1),
				),
			);

		const byTitle = nearby.filter((candidate) =>
			candidate.titles.some((title) => titles.has(strictTitle(title))),
		);

		if (byTitle.length === 1 && byTitle[0]) {
			return {
				anikotoId: String(byTitle[0].anikotoId),
				episodeOffset: 0,
				method: "title",
				title: byTitle[0].title,
			};
		}

		return null;
	}

	/**
	 * Searches AniKoto for the anime's English and romaji titles and adds the
	 * series it finds, most viewed first, to the mirror.
	 */
	async #lookUp(http: HttpClient) {
		/** Search results fetched per title when the mirror has no match. */
		const lookupCandidateLimit = 6;

		const siteUrl = "https://anikototv.to";

		/** AniKoto's series endpoint; the series itself is read by {@link Series}. */
		const SeriesResponseSchema = z.object({
			data: z.object({
				anime: z.json(),
			}),
		});

		const anime = this.#anime;

		const queries = [
			...new Set(
				[anime.title.english, anime.title.romaji].flatMap((title) => {
					if (title) {
						return [title];
					}

					return [];
				}),
			),
		];

		const found = new Set<number>();
		await sequence.all(queries, async (query) => {
			const response = await http.get(
				`${siteUrl}/filter?keyword=${encodeURIComponent(query)}&sort=most-viewed`,
			);

			// AniKoto's default order ranks spin-offs above the main series.
			const html = await response.text();

			for (const [, id] of html.matchAll(/data-tip="(?<id>\d+)"/gu)) {
				found.add(Number(id));
			}
		});

		let stored: {
			anikotoId: number;
		}[] = [];

		if (found.size > 0) {
			stored = await db
				.select({
					anikotoId: anikotoSeries.anikotoId,
				})
				.from(anikotoSeries)
				.where(inArray(anikotoSeries.anikotoId, [...found]));
		}

		const known = new Set(stored.map((row) => row.anikotoId));

		const candidates = [...found].filter((candidate) => !known.has(candidate));

		const fetched = await sequence.all(candidates.slice(0, lookupCandidateLimit), async (id) => {
			const response = await http.get(`${apiUrl}/series/${id}`);
			const parsed = SeriesResponseSchema.safeParse(await response.json());

			if (parsed.success) {
				return new Series(parsed.data.data.anime).row;
			}

			return null;
		});

		const rows = fetched.flatMap((row) => {
			if (row) {
				return [row];
			}

			return [];
		});

		await new Rows(rows).store();
	}

	/**
	 * The AniKoto series a later part continues, when AniKoto files it under its
	 * prequel instead of listing it on its own: Attack on Titan Season 3 Part 2
	 * is episodes 13–22 of AniKoto's Season 3. The part must have aired and
	 * follow a prequel of known length, and AniKoto's series must hold every
	 * episode of both.
	 */
	async #continued(depth: number): Promise<AniKotoMatch | null> {
		const anime = this.#anime;
		const prequel = anime.relations.find((relation) => relation.type === "PREQUEL")?.anime;

		if (depth === 0 || anime.status === "NOT_YET_RELEASED") {
			return null;
		}

		if (!prequel?.episodes) {
			return null;
		}

		// Adult anime are not served, so a part never continues one.
		if (prequel.isAdult || this.#agreement(prequel.format) === null) {
			return null;
		}

		// A prequel AniList has since removed or marked adult.
		const { data, error } = await attempt(getAnime(prequel.id), AnimeNotFoundError);

		if (error) {
			return null;
		}

		const earlier = new Search(data);
		const series = (await earlier.#stored()) ?? (await earlier.#continued(depth - 1));

		if (!series) {
			return null;
		}

		const [stored] = await db
			.select({
				episodes: anikotoSeries.episodes,
			})
			.from(anikotoSeries)
			.where(eq(anikotoSeries.anikotoId, Number(series.anikotoId)));

		const episodeOffset = series.episodeOffset + prequel.episodes;

		// The whole part must be there: a sequel AniKoto has not added yet must
		// not start at a recap AniKoto appended to the prequel.
		if (stored?.episodes && stored.episodes >= episodeOffset + (anime.episodes ?? 1)) {
			return {
				...series,
				episodeOffset,
				method: "continuation",
			};
		}

		return null;
	}
}
