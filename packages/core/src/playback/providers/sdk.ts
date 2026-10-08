import type { BaseProvider, IContentUnit, IMediaMetadata, MappingClient } from "anime-sdk";

import type { Anime } from "../../catalog/models/anime";
import type { ContentLanguage } from "../../models/series";
import type { ProviderEpisode, ProviderMatch, ProviderStream, StreamProvider } from "./provider";

/** What a provider serves, which `anime-sdk` does not describe. */
export interface ProviderTraits {
	/** See {@link StreamProvider.locale}. */
	locale: string;
	/** See {@link StreamProvider.listsLanguages}. */
	listsLanguages: boolean;
}

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
		protected readonly sdk: BaseProvider,
		private readonly mapping: MappingClient,
		traits: ProviderTraits,
	) {
		this.id = sdk.id;
		this.locale = traits.locale;
		this.listsLanguages = traits.listsLanguages;
	}

	async findMedia(anime: Anime): Promise<ProviderMatch | null> {
		const resolution = await this.mapping.resolveProviderMediaId(toSdkMetadata(anime), this.sdk);
		return (
			resolution && {
				mediaId: resolution.rawMediaId,
				matchedTitle: resolution.matchedTitle,
				method: resolution.method,
				episodeOffset: 0,
			}
		);
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
			skipSegments: [],
		};
	}
}

/**
 * The provider's raw ID within an episode ID, which `anime-sdk` prefixes
 * with the provider ID.
 */
export function rawEpisodeId(providerId: string, episodeId: string) {
	const prefix = `${providerId}:`;
	return episodeId.startsWith(prefix) ? episodeId.slice(prefix.length) : episodeId;
}

/** An `anime-sdk` episode as a {@link ProviderEpisode}. */
export function toProviderEpisode(unit: IContentUnit): ProviderEpisode {
	return {
		id: unit.id,
		number: unit.number,
		title: unit.title,
		languages: unit.availableLanguages ?? null,
		isFiller: unit.isFiller ?? null,
	};
}

/**
 * Describes an anime in the shape `anime-sdk`'s mapping client matches on:
 * titles and synonyms for fuzzy search, year and episode count as
 * discriminators, and AniList/MAL IDs for exact lookups.
 */
function toSdkMetadata(anime: Anime): IMediaMetadata {
	const startYear = anime.startDate ? Number(anime.startDate.slice(0, 4)) : undefined;

	return {
		id: `anilist:${anime.id}`,
		providerId: "anilist",
		catalogType: "ANIME",
		title: {
			romaji: anime.title.romaji ?? undefined,
			english: anime.title.english ?? undefined,
			native: anime.title.native ?? undefined,
		},
		synonyms: anime.synonyms,
		year: anime.seasonYear ?? startYear,
		format: anime.format ?? undefined,
		episodeCount: anime.episodes ?? undefined,
		mappings: {
			anilist: anime.id,
			mal: anime.malId ?? undefined,
		},
	};
}
