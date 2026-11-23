import type { Json } from "@sora/shared";
import { z } from "zod";

import type { AnimeFormat } from "../../catalog/models/anime";
import type { AgeRating, anikotoSeries } from "../../database/schema/playback";

/** One series of AniKoto's catalogue, as its listing and its series endpoint send it. */
export class Series {
	/** MyAnimeList's age ratings, which AniKoto copies; see `anikotoSeries.rating`. */
	static readonly #ratings: readonly AgeRating[] = ["G", "PG", "PG-13", "R", "R+", "Rx"];

	/** An ID field AniKoto sends as a number, a numeric string, or an empty string. */
	static readonly #OptionalId = z
		.union([z.number(), z.string()])
		.nullish()
		.transform((value) => {
			const id = Number(value);

			if (Number.isSafeInteger(id) && id > 0) {
				return id;
			}

			return null;
		});

	static readonly #Schema = z.object({
		alternative: z.string().nullish(),
		ani_id: Series.#OptionalId,
		episodes: Series.#OptionalId,
		id: z.number().int().positive(),
		mal_id: Series.#OptionalId,
		native: z.string().nullish(),
		/** One of the age ratings, or an empty string or `None` when it has none. */
		rating: z
			.string()
			.nullish()
			.transform((value) => Series.#ratings.find((rating) => rating === value?.trim()) ?? null),
		terms_by_type: z
			.object({
				type: z.array(z.string()).optional(),
			})
			.nullish(),
		title: z.string().min(1),
		/** Other titles, joined with commas, which titles themselves may contain. */
		titles: z.string().nullish(),
		/** `YYYY-MM-DD hh:mm:ss`, in UTC. */
		updated_at: z.string().regex(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/u),
		year: Series.#OptionalId,
	});

	/** AniKoto's series types, as AniList formats. */
	static readonly #formats = new Map<string, AnimeFormat>(
		Object.entries({
			movie: "MOVIE",
			music: "MUSIC",
			ona: "ONA",
			ova: "OVA",
			special: "SPECIAL",
			tv: "TV",
			"tv short": "TV_SHORT",
			"tv special": "SPECIAL",
			tv_short: "TV_SHORT",
		}),
	);

	readonly #item: Json;

	constructor(item: Json) {
		this.#item = item;
	}

	/** The series as the mirror stores it, or `null` when it is malformed. */
	get row(): typeof anikotoSeries.$inferInsert | null {
		const parsed = Series.#Schema.safeParse(this.#item);

		if (!parsed.success) {
			return null;
		}

		const series = parsed.data;
		const type = series.terms_by_type?.type?.[0]?.trim().toLowerCase();
		let format: AnimeFormat | null = null;

		if (type) {
			format = Series.#formats.get(type) ?? null;
		}

		return {
			anikotoId: series.id,
			anilistId: series.ani_id,
			episodes: series.episodes,
			format,
			malId: series.mal_id,
			rating: series.rating,
			title: series.title,
			titles: [
				...new Set(
					[
						series.title,
						series.alternative,
						series.native,
						series.titles,
						// Titles are joined with commas; the whole string is kept too, for
						// titles that contain one.
						...(series.titles?.split(/[,;] /u) ?? []),
					].flatMap((title) => {
						if (title?.trim()) {
							return [title.trim()];
						}

						return [];
					}),
				),
			],
			updatedAt: new Date(`${series.updated_at.replace(" ", "T")}Z`),
			year: series.year,
		};
	}
}
