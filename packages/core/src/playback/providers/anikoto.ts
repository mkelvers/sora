import { attempt } from "@sora/shared";
import { AnikotoProvider, type HttpClient } from "anime-sdk";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import type { ContentLanguage } from "../../series/models";
import { findAniKotoSeries, syncAniKotoCatalog } from "./anikoto-catalog";
import { resolveMegaPlayEmbed } from "./megaplay";
import type { ProviderEpisode, ProviderMatch, ProviderStream, StreamProvider } from "./provider";
import { rawEpisodeId, toProviderEpisode, type ProviderTraits } from "./sdk";

const siteUrl = "https://anikototv.to";

/** MegaPlay checks that its player is embedded by AniKoto. */
const embedReferer = `${siteUrl}/`;

/** AniKoto's episode list, as its watch page loads it: HTML in a JSON envelope. */
const EpisodeListResponseSchema = z.object({
	result: z.string(),
});

/** The languages AniKoto streams, in the order episode lists give them. */
const languageOrder = ["sub", "dub"] as const satisfies readonly ContentLanguage[];

/** One episode of AniKoto's episode list. */
interface ListedEpisode {
	languages: ContentLanguage[];
	isFiller: boolean;
}

/**
 * AniKoto: matched by ID against a mirror of its catalogue (see
 * {@link findAniKotoSeries}), with filler episodes marked, and streamed
 * through its MegaPlay player (see {@link resolveMegaPlayEmbed}), which
 * ships each stream's opening and ending.
 */
export class AniKotoStreamProvider implements StreamProvider {
	readonly locale: string;
	readonly listsLanguages: boolean;
	private readonly sdk: AnikotoProvider;

	constructor(
		private readonly http: HttpClient,
		traits: ProviderTraits,
	) {
		this.sdk = new AnikotoProvider(http);
		this.locale = traits.locale;
		this.listsLanguages = traits.listsLanguages;
	}

	get id() {
		return this.sdk.id;
	}

	async findMedia(anime: Anime): Promise<ProviderMatch | null> {
		const match = await findAniKotoSeries(this.http, anime);
		return (
			match && {
				mediaId: match.anikotoId,
				matchedTitle: match.title,
				method: match.method,
				episodeOffset: match.episodeOffset,
			}
		);
	}

	/**
	 * Lists the episodes as `anime-sdk` does, with the languages and filler
	 * flags AniKoto's own episode list gives.
	 *
	 * AniKoto's JSON API, which `anime-sdk` reads, leaves out many dubs its
	 * player streams (Banished from the Hero's Party episodes 1–3, a quarter
	 * of Hunter x Hunter's). An episode therefore has every language either
	 * the API or the episode list names. Only the episode list marks filler.
	 *
	 * Both are best-effort: when the episode list cannot be read, or leaves
	 * an episode out, the episode keeps the API's languages and has no filler
	 * flag.
	 */
	async listEpisodes(mediaId: string): Promise<ProviderEpisode[]> {
		const [units, { data: listed, error }] = await Promise.all([
			this.sdk.fetchContentUnits(`${this.id}:${mediaId}`),
			attempt(fetchAniKotoEpisodeList(this.http, mediaId)),
		]);
		if (error) {
			console.warn(`AniKoto's episode list for ${mediaId} could not be read: ${error.message}`);
		}

		return units.map((unit) => {
			const episode = toProviderEpisode(unit);
			const entry = listed?.get(unit.number);
			if (!entry) {
				return {
					...episode,
					isFiller: null,
				};
			}

			const languages = new Set([...(episode.languages ?? []), ...entry.languages]);
			return {
				...episode,
				languages: languageOrder.filter((language) => languages.has(language)),
				isFiller: entry.isFiller,
			};
		});
	}

	resolveStream(episodeId: string, language: ContentLanguage): Promise<ProviderStream> {
		return resolveMegaPlayEmbed(
			this.http,
			`https://megaplay.buzz/stream/s-2/${rawEpisodeId(this.id, episodeId)}/${language}`,
			embedReferer,
			language,
		);
	}

	/**
	 * Mirrors AniKoto's catalogue, which series are matched against. The first
	 * sync, with nothing stored, reads the whole catalogue: about 450 pages at
	 * AniKoto's limit of 60 requests a minute.
	 */
	async syncCatalog(options: { full: boolean }) {
		const { pages, stored } = await syncAniKotoCatalog(this.http, options);
		return `Synced ${stored} AniKoto series from ${pages} catalogue pages`;
	}
}

/**
 * Reads AniKoto's episode list, as its watch page loads it. Each episode's
 * link carries `data-sub` and `data-dub` flags, which the watch page's
 * language switch follows, and a `filler` class on filler episodes.

 *
 * @returns Each listed episode's languages and filler flag, by number.
 * @throws when the list cannot be read or lists no episodes.
 */
async function fetchAniKotoEpisodeList(
	http: HttpClient,
	mediaId: string,
): Promise<Map<number, ListedEpisode>> {
	const response = await http.get(`${siteUrl}/ajax/episode/list/${encodeURIComponent(mediaId)}`, {
		headers: {
			"X-Requested-With": "XMLHttpRequest",
		},
	});
	const { result } = EpisodeListResponseSchema.parse(await response.json());

	const links = result.match(/<a\b[^>]*\bdata-num="[^"]*"[^>]*>/g) ?? [];
	if (links.length === 0) {
		throw new Error("AniKoto's episode list has no episodes");
	}

	const episodes = new Map<number, ListedEpisode>();
	for (const link of links) {
		const number = Number(/\bdata-num="([^"]*)"/.exec(link)?.[1]);
		if (!Number.isFinite(number)) {
			continue;
		}

		const classes = /\bclass="([^"]*)"/.exec(link)?.[1]?.split(/\s+/) ?? [];
		episodes.set(number, {
			languages: languageOrder.filter((language) =>
				new RegExp(`\\bdata-${language}="1"`).test(link),
			),
			isFiller: classes.includes("filler"),
		});
	}

	return episodes;
}
