import type { MediaSource, SearchIndexPageQuery } from "../../anilist/graphql.generated";
import type { animeSearch, animeSearchTag } from "../../database/schema/catalog";
import { searchText } from "./titles";

/** An entry of a page of the catalogue, as AniList serves it to the search index. */
export type IndexedMedia = NonNullable<
	NonNullable<NonNullable<SearchIndexPageQuery["Page"]>["media"]>[number]
>;

/** An AniList entry as the search index stores it. */
export class IndexedEntry {
	/** Sources that name no earlier work for a story to come from. */
	static readonly #ownSources = new Set<MediaSource | null | undefined>([
		null,
		undefined,
		"ORIGINAL",
		"OTHER",
	]);

	readonly #media: IndexedMedia;

	constructor(media: IndexedMedia) {
		this.#media = media;
	}

	/** The entry's row in `anime_search`. */
	get row(): typeof animeSearch.$inferInsert {
		const media = this.#media;
		const english = media.title?.english ?? null;
		const romaji = media.title?.romaji ?? null;
		const native = media.title?.native ?? null;

		const synonyms = (media.synonyms ?? []).flatMap((synonym) => {
			if (synonym?.trim()) {
				return [synonym.trim()];
			}

			return [];
		});

		const start = media.startDate;
		let startDate: string | null = null;

		if (start?.year) {
			const parts: (number | null | undefined)[] = [start.year, start.month];

			if (start.month) {
				parts.push(start.day);
			}

			startDate = parts
				.flatMap((part) => {
					if (part) {
						return [String(part).padStart(2, "0")];
					}

					return [];
				})
				.join("-");
		}

		return {
			anilistId: media.id,
			averageScore: media.averageScore,
			country: media.countryOfOrigin,
			duration: media.duration,
			english,
			episodes: media.episodes,
			format: media.format,
			...this.#origin,
			genres: (media.genres ?? []).flatMap((genre) => {
				if (genre) {
					return [genre];
				}

				return [];
			}),
			isAdult: media.isAdult === true,
			native,
			popularity: media.popularity ?? 0,
			romaji,
			scoreCount:
				media.stats?.scoreDistribution?.reduce(
					(total, bucket) => total + (bucket?.amount ?? 0),
					0,
				) ?? null,
			scoreStars: this.#stars,
			searchText: searchText([english, romaji, native, ...synonyms]),
			season: media.season,
			seasonYear: media.seasonYear,
			source: media.source,
			startDate,
			status: media.status,
			studios: this.#studios,
			synonyms,
			trending: media.trending ?? 0,
			updatedAt: new Date((media.updatedAt ?? 0) * 1000),
		};
	}

	/** The entry's rows in `anime_search_tag`, one per tag. */
	get tags(): (typeof animeSearchTag.$inferInsert)[] {
		return [
			...new Map(
				(this.#media.tags ?? []).flatMap((tag) => {
					if (tag) {
						return [
							[
								tag.name,
								{
									adult: tag.isAdult === true,
									anilistId: this.#media.id,
									rank: tag.rank ?? 0,
									spoiler: tag.isMediaSpoiler === true,
									tag: tag.name,
								},
							] as const,
						];
					}

					return [];
				}),
			).values(),
		];
	}

	/**
	 * Where the entry's story comes from: the country of the work it adapts and
	 * what that work adapts in turn, as AniList relates them. The anime of a
	 * Korean comic of a web novel is made in Japan from a manga, but its story
	 * is Korean and began as a web novel.
	 */
	get #origin() {
		const adapted = this.#media.relations?.edges?.find(
			(edge) => edge?.relationType === "SOURCE",
		)?.node;

		let originSource: MediaSource | null = adapted?.source ?? null;

		if (IndexedEntry.#ownSources.has(adapted?.source)) {
			originSource = null;
		}

		return {
			originCountry: adapted?.countryOfOrigin ?? this.#media.countryOfOrigin,
			originSource,
		};
	}

	get #studios() {
		return [
			...new Set(
				(this.#media.studios?.nodes ?? []).flatMap((studio) => {
					if (studio) {
						return [studio.name];
					}

					return [];
				}),
			),
		];
	}

	/** How many scores AniList's ten buckets (10 to 100, ascending) put on each star: two buckets to a star. */
	get #stars() {
		const distribution = this.#media.stats?.scoreDistribution;

		if (!distribution || distribution.length !== 10) {
			return null;
		}

		return Array.from(
			{
				length: 5,
			},
			(_, star) =>
				(distribution[star * 2]?.amount ?? 0) + (distribution[star * 2 + 1]?.amount ?? 0),
		);
	}
}
