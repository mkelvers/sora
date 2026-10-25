import type {
	AnimeCardFragment,
	AnimeDetailsFragment,
	MediaFormat,
	MediaRelation,
	MediaSeason,
	MediaSource,
	MediaStatus,
} from "../../anilist/graphql.generated";
import { fromUnixSeconds, fuzzyDate, synopsis } from "./text";

export type AnimeFormat = Exclude<MediaFormat, "MANGA" | "NOVEL" | "ONE_SHOT">;
export type AnimeStatus = MediaStatus;
type AnimeSeason = MediaSeason;
type AnimeSource = MediaSource;
type AnimeRelationType = MediaRelation;

/**
 * Every title AniList knows, plus the one to show.
 *
 * `display` prefers English, then romaji, then native, which matches what
 * most Western clients expect. Clients that want a different preference can
 * pick from the individual fields.
 */
interface AnimeTitle {
	display: string;
	english: string | null;
	romaji: string | null;
	native: string | null;
}

/** An upcoming episode announced by AniList. */
interface AiringEpisode {
	number: number;
	/** ISO 8601 timestamp. */
	airingAt: string;
}

/**
 * The compact form of an anime, for lists, grids, and carousels.
 *
 * @remarks
 * All catalog models are plain JSON-safe values, so any transport can return
 * them unchanged.
 */
export interface AnimeCard {
	/** AniList ID. This is the canonical anime ID across the whole system. */
	id: number;
	malId: number | null;
	title: AnimeTitle;
	coverUrl: string | null;
	/** Dominant cover colour as `#rrggbb`, useful for placeholder backgrounds. */
	coverColor: string | null;
	bannerUrl: string | null;
	format: AnimeFormat | null;
	status: AnimeStatus | null;
	season: AnimeSeason | null;
	seasonYear: number | null;
	/** Planned episode count; `null` while unknown. */
	episodes: number | null;
	durationMinutes: number | null;
	/** Weighted average score, 0–100. */
	score: number | null;
	popularity: number | null;
	genres: string[];
	nextEpisode: AiringEpisode | null;
	isAdult: boolean;
}

/** A related entry in the same franchise. */
interface AnimeRelation {
	type: AnimeRelationType;
	anime: AnimeCard;
}

export interface AnimeTag {
	name: string;
	/** How strongly the tag applies, 0–100. */
	rank: number | null;
	spoiler: boolean;
}

/** Everything needed to render an anime's detail screen. */
export interface Anime extends AnimeCard {
	synonyms: string[];
	/** Plain-text synopsis cut down to its premise (see {@link synopsis}). */
	description: string | null;
	source: AnimeSource | null;
	countryOfOrigin: string | null;
	/** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, depending on what is known. */
	startDate: string | null;
	endDate: string | null;
	tags: AnimeTag[];
	studios: string[];
	relations: AnimeRelation[];
	recommendations: AnimeCard[];
}

export const toAnimeFormat = (format: MediaFormat | null): AnimeFormat | null => {
	switch (format) {
		case "MANGA":
		case "NOVEL":
		case "ONE_SHOT": {
			throw new TypeError(`Unexpected non-anime format ${format}`);
		}
		default: {
			return format;
		}
	}
};

/** Drops GraphQL list holes; a null list is treated as empty. */
const present = <T>(values: readonly (T | null)[] | null | undefined): T[] =>
	values ? values.filter((value): value is T => value !== null) : [];

const toTitle = (media: AnimeCardFragment): AnimeTitle => {
	const english = media.title?.english ?? null;
	const romaji = media.title?.romaji ?? null;
	const native = media.title?.native ?? null;
	const display = english ?? romaji ?? native;
	if (!display) {
		throw new TypeError(`AniList media ${media.id} has no title`);
	}

	return {
		display,
		english,
		native,
		romaji,
	};
};

/**
 * Converts an AniList card fragment into the domain model.
 *
 * @throws {TypeError} when AniList returns media with no title at all, which
 *   would violate AniList's own data rules.
 */
export const toAnimeCard = (media: AnimeCardFragment): AnimeCard => ({
	bannerUrl: media.bannerImage,
	coverColor: media.coverImage?.color ?? null,
	coverUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
	durationMinutes: media.duration,
	episodes: media.episodes,
	format: toAnimeFormat(media.format),
	genres: present(media.genres),
	id: media.id,
	isAdult: media.isAdult === true,
	malId: media.idMal,
	nextEpisode: media.nextAiringEpisode
		? {
				airingAt: fromUnixSeconds(media.nextAiringEpisode.airingAt),
				number: media.nextAiringEpisode.episode,
			}
		: null,
	popularity: media.popularity,
	score: media.averageScore,
	season: media.season,
	seasonYear: media.seasonYear,
	status: media.status,
	title: toTitle(media),
});

/** Converts an AniList details fragment into the domain model. */
export const toAnime = (media: AnimeDetailsFragment): Anime => ({
	...toAnimeCard(media),
	countryOfOrigin: media.countryOfOrigin,
	description: (media.description && synopsis(media.description)) || null,
	endDate: media.endDate ? fuzzyDate(media.endDate) : null,
	recommendations: present(media.recommendations?.nodes).flatMap((node) =>
		node.mediaRecommendation?.type === "ANIME" ? [toAnimeCard(node.mediaRecommendation)] : [],
	),
	relations: present(media.relations?.edges).flatMap((edge) =>
		edge.relationType && edge.node?.type === "ANIME"
			? [
					{
						anime: toAnimeCard(edge.node),
						type: edge.relationType,
					},
				]
			: [],
	),
	source: media.source,
	startDate: media.startDate ? fuzzyDate(media.startDate) : null,
	studios: present(media.studios?.nodes).map((studio) => studio.name),
	synonyms: present(media.synonyms),
	tags: present(media.tags).map((tag) => ({
		name: tag.name,
		rank: tag.rank,
		spoiler: tag.isMediaSpoiler === true,
	})),
});
