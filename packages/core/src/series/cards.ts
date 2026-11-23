import { inArray } from "drizzle-orm";

import { toDetails } from "../catalog/models/anime";
import type { AnimeFormat } from "../catalog/models/anime";
import { isVisibleFormat } from "../catalog/visibility";
import { db } from "../database/client";
import { anime as animeTable } from "../database/schema/catalog";
import { noArtwork, titleArtwork } from "../database/schema/series";
import type { series } from "../database/schema/series";
import type { ContentLanguage, SeriesCard } from "../models/series";
import { findAnimeLanguages } from "../playback/episodes/versions";

type SeriesRow = typeof series.$inferSelect;

/** Stored series rows as the cards clients see, keyed by series ID. */
export class Cards {
	static readonly #formatNames: Record<AnimeFormat, string> = {
		MOVIE: "Movie",
		MUSIC: "Music",
		ONA: "ONA",
		OVA: "OVA",
		SPECIAL: "Special",
		TV: "Series",
		TV_SHORT: "Short",
	};

	static readonly #statusNames = new Map<string, string>(
		Object.entries({
			NOT_YET_RELEASED: "Upcoming",
			RELEASING: "Airing",
		}),
	);

	readonly #rows: readonly SeriesRow[];
	readonly #listed: ReadonlyMap<string, readonly unknown[]>;
	readonly #includeHiddenIds: readonly string[];

	/**
	 * @param listed - The episodes each row lists, by series ID.
	 * @param includeHiddenIds - Rows to show although their format is hidden from the catalogue.
	 */
	constructor(
		rows: readonly SeriesRow[],
		listed: ReadonlyMap<string, readonly unknown[]>,
		includeHiddenIds: readonly string[] = [],
	) {
		this.#rows = rows;
		this.#listed = listed;
		this.#includeHiddenIds = includeHiddenIds;
	}

	/** The artwork readers see: the chosen image, none when that was chosen, else the laid-out one. */
	static #artwork(override: string | null, laidOut: string | null) {
		if (override === noArtwork) {
			return null;
		}

		return override ?? laidOut;
	}

	/** The artwork a card shows: the chosen image or the laid-out one, and where the logo sits. */
	static #artworkOf(row: SeriesRow, title: typeof titleArtwork.$inferSelect | undefined) {
		return {
			backdrop_url: Cards.#artwork(title?.backdropUrlOverride ?? null, row.backdropUrl),
			logo_offset_x: title?.logoOffsetX ?? 0,
			logo_offset_y: title?.logoOffsetY ?? 0,
			logo_scale: title?.logoScale ?? 1,
			logo_url: Cards.#artwork(title?.logoUrlOverride ?? null, row.logoUrl),
			poster_url: Cards.#artwork(row.posterUrlOverride, row.posterUrl),
		};
	}

	/** A stored series as a card, from what is known of its anime, chosen artwork, audio, and episodes. */
	static #card(
		row: SeriesRow,
		known: {
			audio: ContentLanguage[];
			details: ReturnType<typeof toDetails> | undefined;
			episodeCount: number;
			title: typeof titleArtwork.$inferSelect | undefined;
		},
	): SeriesCard {
		const { audio, details, episodeCount, title } = known;
		const format = details?.format;

		// A card's line of year, format, and status.
		const line = [
			row.startDate?.slice(0, 4),
			format && Cards.#formatNames[format],
			row.status && Cards.#statusNames.get(row.status),
		]
			.filter(Boolean)
			.join(" · ");

		let year: number | null = null;

		if (row.startDate) {
			year = Number(row.startDate.slice(0, 4));
		}

		return {
			audio,
			...Cards.#artworkOf(row, title),
			details: line,
			episode_count: episodeCount,
			format: details?.format ?? null,
			genres: details?.genres ?? [],
			id: row.id,
			kind: row.kind,
			overview: row.overview ?? details?.description ?? null,
			score: details?.score ?? null,
			status: row.status,
			title: row.title,
			year,
		};
	}

	/** The cards, each with its title's audio and listed episodes. Reads only the database. */
	async build(): Promise<Map<string, SeriesCard>> {
		const rows = this.#rows;
		const anilistIds = rows.map((row) => row.anilistId);
		const keys = [...new Set(rows.map((row) => row.key))];

		const [stored, languages, chosen] = await Promise.all([
			db
				.select({
					anilistId: animeTable.anilistId,
					media: animeTable.media,
				})
				.from(animeTable)
				.where(inArray(animeTable.anilistId, anilistIds)),
			findAnimeLanguages(anilistIds),
			db.select().from(titleArtwork).where(inArray(titleArtwork.key, keys)),
		]);

		const anime = new Map(stored.map((row) => [row.anilistId, toDetails(row.media)]));
		const artwork = new Map(chosen.map((row) => [row.key, row]));
		const order: ContentLanguage[] = ["dub", "sub", "raw"];

		return new Map(
			rows.flatMap((row) => {
				const details = anime.get(row.anilistId);

				if (!isVisibleFormat(details?.format) && !this.#includeHiddenIds.includes(row.id)) {
					return [];
				}

				const audio = new Set(languages.get(row.anilistId));

				return [
					[
						row.id,
						Cards.#card(row, {
							audio: order.filter((language) => audio.has(language)),
							details,
							episodeCount: this.#listed.get(row.id)?.length ?? 0,
							title: artwork.get(row.key),
						}),
					] as const,
				];
			}),
		);
	}
}
