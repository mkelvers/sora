import type {
	AnimeCardFragment,
	AnimeDetailsFragment,
	MediaFormat,
	MediaRelation,
	MediaSeason,
	MediaSource,
	MediaStatus,
} from "../../anilist/graphql.generated";
import { Sparse } from "./sparse";
import { aboutLength, fromUnixSeconds, fuzzyDate, synopsis } from "./text";

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

/** Someone AniList credits for the anime, such as its director. */
export interface AnimeCredit {
	/** As AniList words it, such as `Director` or `Director (eps 1-278)`. */
	role: string;
	name: string;
}

/** Everything needed to render an anime's detail screen. */
export interface Anime extends AnimeCard {
	synonyms: string[];
	/** Plain-text synopsis cut down to its premise (see {@link synopsis}). */
	description: string | null;
	/** Plain-text synopsis for an about section, of about 90 words at most (see {@link synopsis}). */
	blurb: string | null;
	source: AnimeSource | null;
	countryOfOrigin: string | null;
	/** `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, depending on what is known. */
	startDate: string | null;
	endDate: string | null;
	tags: AnimeTag[];
	studios: string[];
	/**
	 * The companies behind it other than its studios, such as the publisher
	 * of what it adapts; empty until the stored copy is fetched again with
	 * them (see `catalog.refreshStale`).
	 */
	producers: string[];
	/** The most relevant credits, at most 25; empty until the stored copy is fetched again with them (see `catalog.refreshStale`). */
	staff: AnimeCredit[];
	relations: AnimeRelation[];
	recommendations: AnimeCard[];
}

export const toFormat = (format: MediaFormat | null): AnimeFormat | null => {
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

/**
 * Converts an AniList card fragment into the domain model.
 *
 * @throws {TypeError} when AniList returns media with no title at all, which
 *   would violate AniList's own data rules.
 */
export const toCard = (media: AnimeCardFragment): AnimeCard => {
	const format = toFormat(media.format);
	const english = media.title?.english ?? null;
	const romaji = media.title?.romaji ?? null;
	const native = media.title?.native ?? null;
	const display = english ?? romaji ?? native;

	if (!display) {
		throw new TypeError(`AniList media ${media.id} has no title`);
	}

	let nextEpisode: AnimeCard["nextEpisode"] = null;

	if (media.nextAiringEpisode) {
		nextEpisode = {
			airingAt: fromUnixSeconds(media.nextAiringEpisode.airingAt),
			number: media.nextAiringEpisode.episode,
		};
	}

	return {
		bannerUrl: media.bannerImage,
		coverColor: media.coverImage?.color ?? null,
		coverUrl: media.coverImage?.extraLarge ?? media.coverImage?.large ?? null,
		durationMinutes: media.duration,
		episodes: media.episodes,
		format,
		genres: new Sparse(media.genres).present,
		id: media.id,
		isAdult: media.isAdult === true,
		malId: media.idMal,
		nextEpisode,
		popularity: media.popularity,
		score: media.averageScore,
		season: media.season,
		seasonYear: media.seasonYear,
		status: media.status,
		title: {
			display,
			english,
			native,
			romaji,
		},
	};
};

/** Converts an AniList details fragment into the domain model. */
export const toDetails = (media: AnimeDetailsFragment): Anime => {
	const card = toCard(media);

	/** The companies credited with an anime: its studios when `main`, else the rest. */
	const companies = (main: boolean) =>
		new Sparse(media.studios?.edges).present.flatMap((edge) => {
			if (edge.isMain === main && edge.node) {
				return [edge.node.name];
			}

			return [];
		});

	let endDate: string | null = null;

	if (media.endDate) {
		endDate = fuzzyDate(media.endDate);
	}

	let startDate: string | null = null;

	if (media.startDate) {
		startDate = fuzzyDate(media.startDate);
	}

	return {
		...card,
		blurb: (media.description && synopsis(media.description, aboutLength)) || null,
		countryOfOrigin: media.countryOfOrigin,
		description: (media.description && synopsis(media.description)) || null,
		endDate,
		producers: companies(false),
		recommendations: new Sparse(media.recommendations?.nodes).present.flatMap((node) => {
			if (node.mediaRecommendation?.type === "ANIME") {
				return [toCard(node.mediaRecommendation)];
			}

			return [];
		}),
		relations: new Sparse(media.relations?.edges).present.flatMap((edge) => {
			if (edge.relationType && edge.node?.type === "ANIME") {
				return [
					{
						anime: toCard(edge.node),
						type: edge.relationType,
					},
				];
			}

			return [];
		}),
		source: media.source,
		staff: new Sparse(media.staff?.edges).present.flatMap((edge) => {
			const name = edge.node?.name?.full?.trim();

			if (edge.role && name) {
				return [
					{
						name,
						role: edge.role,
					},
				];
			}

			return [];
		}),
		startDate,
		studios: companies(true),
		synonyms: new Sparse(media.synonyms).present,
		tags: new Sparse(media.tags).present.map((tag) => ({
			name: tag.name,
			rank: tag.rank,
			spoiler: tag.isMediaSpoiler === true,
		})),
	};
};
