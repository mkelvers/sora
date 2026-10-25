import type { BaseProvider, IContentUnit, IMediaMetadata, MappingResolution } from "anime-sdk";

import type { Anime } from "../../catalog/models/anime";
import type { ContentLanguage } from "../../models/series";
import { bestSimilarity } from "../../series/matching";
import type { ProviderEpisode, ProviderMatch, ProviderStream, StreamProvider } from "./provider";

/** What this asks of an `anime-sdk` provider; the SDK's providers fit. */
export type SdkProvider = Pick<BaseProvider, "id" | "fetchContentUnits" | "resolveStream">;

/** What this asks of `anime-sdk`'s mapping client, which fits. */
export interface ProviderMapping {
	resolveProviderMediaId(
		metadata: IMediaMetadata,
		provider: SdkProvider,
	): Promise<MappingResolution | null>;
}

/** What a provider serves, which `anime-sdk` does not describe. */
export interface ProviderTraits {
	/** See {@link StreamProvider.locale}. */
	locale: string;
	/** See {@link StreamProvider.listsLanguages}. */
	listsLanguages: boolean;
}

/**
 * Describes an anime in the shape `anime-sdk`'s mapping client matches on:
 * titles and synonyms for fuzzy search, year and episode count as
 * discriminators, and AniList/MAL IDs for exact lookups.
 */
const toSdkMetadata = (anime: Anime): IMediaMetadata => {
	const startYear = anime.startDate ? Number(anime.startDate.slice(0, 4)) : undefined;

	return {
		catalogType: "ANIME",
		episodeCount: anime.episodes ?? undefined,
		format: anime.format ?? undefined,
		id: `anilist:${anime.id}`,
		mappings: {
			anilist: anime.id,
			mal: anime.malId ?? undefined,
		},
		providerId: "anilist",
		synonyms: anime.synonyms,
		title: {
			english: anime.title.english ?? undefined,
			native: anime.title.native ?? undefined,
			romaji: anime.title.romaji ?? undefined,
		},
		year: anime.seasonYear ?? startYear,
	};
};

/** The least a provider's title may resemble the anime's for a title match. */
const minimumTitleSimilarity = 0.78;

/** How many episodes more than the anime's count a provider's list may have. */
const episodeCountTolerance = 3;

/**
 * Whether a series found by searching titles is the anime.
 *
 * The title must be about as alike as `anime-sdk` asks and number the same
 * instalment ("Season 2" never matches "Season 3"). When AniList knows how
 * many episodes the anime has, the provider's list may not run past them: a
 * longer list is a whole series holding the anime's special, film or one
 * season among others, and playing it would number the episodes wrong. A
 * shorter list, or none, is kept; the title is right and the provider is only
 * missing episodes.
 */
export const acceptsTitleMatch = (anime: Anime, matchedTitle: string, providerEpisodes: number) => {
	const titles = [
		anime.title.english,
		anime.title.romaji,
		anime.title.native,
		...anime.synonyms,
	].flatMap((title) => (title ? [title] : []));
	if (
		bestSimilarity(titles, [matchedTitle], {
			sameNumbers: true,
		}) < minimumTitleSimilarity
	) {
		return false;
	}

	if (anime.episodes === null) {
		return true;
	}

	return providerEpisodes <= anime.episodes + episodeCountTolerance;
};

/** An `anime-sdk` episode as a {@link ProviderEpisode}. */
export const toProviderEpisode = (unit: IContentUnit): ProviderEpisode => {
	return {
		id: unit.id,
		isFiller: unit.isFiller ?? null,
		languages: unit.availableLanguages ?? null,
		number: unit.number,
		title: unit.title,
	};
};

/**
 * A {@link StreamProvider} backed by an `anime-sdk` provider: series are
 * matched by `anime-sdk`'s mapping client, and episodes and streams come from
 * the provider as it ships. Providers that need more override the methods
 * they differ in.
 */
export class SdkStreamProvider implements StreamProvider {
	readonly id: string;
	readonly locale: string;
	readonly listsLanguages: boolean;

	constructor(
		protected readonly sdk: SdkProvider,
		private readonly mapping: ProviderMapping,
		traits: ProviderTraits,
	) {
		this.id = sdk.id;
		this.locale = traits.locale;
		this.listsLanguages = traits.listsLanguages;
	}

	/**
	 * Matches the anime through `anime-sdk`, which tries IDs first and then
	 * searches by title. A title search takes a title that merely resembles the
	 * anime, such as an earlier season, so it is kept only when {@link acceptsTitleMatch}
	 * agrees; other providers' lists are numbered by episode, so a wrong
	 * season would play the wrong episodes.
	 */
	async findMedia(anime: Anime): Promise<ProviderMatch | null> {
		const resolution = await this.mapping.resolveProviderMediaId(toSdkMetadata(anime), this.sdk);
		if (!resolution) {
			return null;
		}

		if (resolution.method === "fuzzy") {
			const units = await this.sdk.fetchContentUnits(`${this.id}:${resolution.rawMediaId}`);
			if (!acceptsTitleMatch(anime, resolution.matchedTitle, units.length)) {
				return null;
			}
		}

		return {
			episodeOffset: 0,
			matchedTitle: resolution.matchedTitle,
			mediaId: resolution.rawMediaId,
			method: resolution.method,
		};
	}

	async listEpisodes(mediaId: string): Promise<ProviderEpisode[]> {
		const units = await this.sdk.fetchContentUnits(`${this.id}:${mediaId}`);

		return units.map(toProviderEpisode);
	}

	/**
	 * Resolves the stream `anime-sdk` hands out for `language`, keeping only
	 * videos in that language. Some providers ignore the language they are
	 * asked for and always serve one: AnimeParadise answers a dub request with
	 * its Japanese-audio sub, which must not pass for a dub.
	 *
	 * @throws when no video is in `language`.
	 */
	async resolveStream(episodeId: string, language: ContentLanguage): Promise<ProviderStream> {
		const resolved = await this.sdk.resolveStream(episodeId, language);
		if (resolved.type !== "video") {
			throw new Error("No video streams returned");
		}

		const streams = resolved.streams.filter(
			(stream) => stream.language === undefined || stream.language === language,
		);
		if (streams.length === 0) {
			throw new Error("No video streams returned");
		}

		return {
			skipSegments: [],
			videos: streams.map((stream) => ({
				url: stream.sourceUrl,
				format: stream.isHLS ? "hls" : "mp4",
				quality: stream.quality,
				headers: stream.headers ?? {},
				subtitles: (stream.subtitles ?? []).map((track) => ({
					url: track.url,
					language: track.language,
					label: track.label,
					format: track.format ?? null,
				})),
			})),
		};
	}
}

/**
 * The provider's raw ID within an episode ID, which `anime-sdk` prefixes
 * with the provider ID.
 */
export const rawEpisodeId = (providerId: string, episodeId: string) => {
	const prefix = `${providerId}:`;
	return episodeId.startsWith(prefix) ? episodeId.slice(prefix.length) : episodeId;
};
