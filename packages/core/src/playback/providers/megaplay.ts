import { MegaPlayProvider } from "anime-sdk";
import type { HttpClient, MappingClient } from "anime-sdk";

import type { ContentLanguage } from "../../models/series";
import { Embed } from "./embed";
import type { ProviderStream } from "./provider";
import { rawEpisodeId, SdkStreamProvider } from "./sdk";
import type { ProviderTraits } from "./sdk";

/**
 * MegaPlay, whose episode lists are made up from AniList's episode count and
 * whose streams go through {@link Embed}.
 */
export class MegaPlay extends SdkStreamProvider {
	private readonly http: HttpClient;

	constructor(http: HttpClient, mapping: MappingClient, traits: ProviderTraits) {
		super(new MegaPlayProvider(http), mapping, traits);
		this.http = http;
	}

	override resolveStream(episodeId: string, language: ContentLanguage): Promise<ProviderStream> {
		// Raw episode IDs are `<anilistId>:<episode>`.
		const [anilistId, episode] = rawEpisodeId(this.id, episodeId).split(":");

		const embed = new Embed(
			this.http,
			`https://megaplay.buzz/stream/ani/${anilistId}/${episode}/${language}`,
			"https://megaplay.buzz/",
			language,
		);

		return embed.stream();
	}
}
