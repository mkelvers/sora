import { AnikotoProvider, type HttpClient } from "anime-sdk";
import { z } from "zod";

import type { Anime } from "../../catalog/models/anime";
import { findAniKotoSeries, syncAniKotoCatalog } from "./anikoto-catalog";
import { resolveMegaPlayEmbed } from "./megaplay";
import type { ContentLanguage } from "../../series/models";
import type { ProviderEpisode, ProviderMatch, ProviderStream, StreamProvider } from "./provider";
import { rawEpisodeId, toProviderEpisode, type ProviderTraits } from "./sdk";

const siteUrl = "https://anikototv.to";

/** MegaPlay checks that its player is embedded by AniKoto. */
const embedReferer = `${siteUrl}/`;

/** AniKoto's episode list, as its watch page loads it: HTML in a JSON envelope. */
const EpisodeListResponseSchema = z.object({
  result: z.string()
});

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
    traits: ProviderTraits
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
        episodeOffset: match.episodeOffset
      }
    );
  }

  /**
   * Lists the episodes as `anime-sdk` does and marks each one filler or not,
   * which only AniKoto's own episode list says.
   *
   * Filler flags are best-effort: when that list cannot be read, the episodes
   * are returned without them.
   */
  async listEpisodes(mediaId: string): Promise<ProviderEpisode[]> {
    const [units, filler] = await Promise.all([
      this.sdk.fetchContentUnits(`${this.id}:${mediaId}`),
      this.fetchFillerEpisodes(mediaId).catch(() => null)
    ]);

    return units.map((unit) => ({
      ...toProviderEpisode(unit),
      isFiller: filler ? filler.has(unit.number) : null
    }));
  }

  resolveStream(episodeId: string, language: ContentLanguage): Promise<ProviderStream> {
    return resolveMegaPlayEmbed(
      this.http,
      `https://megaplay.buzz/stream/s-2/${rawEpisodeId(this.id, episodeId)}/${language}`,
      embedReferer,
      language
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

  /**
   * Reads which episodes AniKoto's site marks as filler. Its JSON API does
   * not say; the watch page's episode list tags each filler episode's link
   * with a `filler` class.
   *
   * @returns Numbers of the filler episodes.
   * @throws when the list cannot be read or lists no episodes.
   */
  private async fetchFillerEpisodes(mediaId: string): Promise<Set<number>> {
    const response = await this.http.get(`${siteUrl}/ajax/episode/list/${encodeURIComponent(mediaId)}`, {
      headers: {
        "X-Requested-With": "XMLHttpRequest"
      }
    });
    const { result } = EpisodeListResponseSchema.parse(await response.json());

    const links = result.match(/<a\b[^>]*\bdata-num="[^"]*"[^>]*>/g) ?? [];
    if (links.length === 0) {
      throw new Error("AniKoto's episode list has no episodes");
    }

    const filler = new Set<number>();
    for (const link of links) {
      const number = Number(/\bdata-num="([^"]*)"/.exec(link)?.[1]);
      const classes = /\bclass="([^"]*)"/.exec(link)?.[1]?.split(/\s+/) ?? [];
      if (Number.isFinite(number) && classes.includes("filler")) {
        filler.add(number);
      }
    }

    return filler;
  }
}
