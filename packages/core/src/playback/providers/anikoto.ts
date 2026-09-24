import {
  AnikotoProvider,
  unwrapUrn,
  type CallOptions,
  type ContentLanguage,
  type IContentUnit,
  type ResolvedMediaStream
} from "anime-sdk";
import { z } from "zod";

import { fetchMegaPlaySources, resolveMegaPlayEmbed } from "./megaplay";

const siteUrl = "https://anikototv.to";

/** MegaPlay checks that its player is embedded by AniKoto. */
const embedReferer = `${siteUrl}/`;

/** AniKoto's episode list, as its watch page loads it: HTML in a JSON envelope. */
const EpisodeListResponseSchema = z.object({
  result: z.string()
});

/** An opening or ending span AniKoto reports, in seconds from the start. */
export interface AniKotoSkipSpan {
  kind: "opening" | "ending";
  start: number;
  end: number;
}

/**
 * AniKoto with MegaPlay's encrypted source payload handled (see
 * {@link resolveMegaPlayEmbed}) and filler episodes marked.
 */
export class AniKotoStreamProvider extends AnikotoProvider {
  /**
   * Lists the episodes as `anime-sdk` does and marks each one filler or not,
   * which only AniKoto's own episode list says.
   *
   * Filler flags are best-effort: when that list cannot be read, the episodes
   * are returned without them.
   */
  protected override async fetchContentUnitsRaw(mediaId: string, options: CallOptions = {}): Promise<IContentUnit[]> {
    const [units, filler] = await Promise.all([
      super.fetchContentUnitsRaw(mediaId, options),
      this.fetchFillerEpisodes(mediaId, options).catch(() => null)
    ]);

    return filler
      ? units.map((unit) => ({
          ...unit,
          isFiller: filler.has(unit.number)
        }))
      : units;
  }

  protected override resolveStreamRaw(
    unitId: string,
    language: ContentLanguage = "sub",
    options: CallOptions = {}
  ): Promise<ResolvedMediaStream> {
    return resolveMegaPlayEmbed(this.http, this.embedUrl(unitId, language), embedReferer, language, options.signal);
  }

  /**
   * Reads the opening and ending times AniKoto's player ships with an episode.
   * They are timed against the stream {@link resolveStreamRaw} serves.
   *
   * @param unitId - A stored unit ID, as {@link resolveStream} takes it.
   * @returns Spans in playback order; empty when AniKoto has none.
   * @throws when the embed or its sources cannot be read.
   */
  async resolveSkipSpans(unitId: string, language: ContentLanguage, options: CallOptions = {}): Promise<AniKotoSkipSpan[]> {
    const sources = await fetchMegaPlaySources(
      this.http,
      this.embedUrl(unwrapUrn(this.id, unitId), language),
      embedReferer,
      language,
      options.signal
    );

    const spans: AniKotoSkipSpan[] = [];
    if (sources.intro && sources.intro.end > sources.intro.start) {
      spans.push({
        kind: "opening",
        ...sources.intro
      });
    }
    if (sources.outro && sources.outro.end > sources.outro.start) {
      spans.push({
        kind: "ending",
        ...sources.outro
      });
    }

    return spans.sort((left, right) => left.start - right.start);
  }

  /**
   * Reads which episodes AniKoto's site marks as filler. Its JSON API does
   * not say; the watch page's episode list tags each filler episode's link
   * with a `filler` class.
   *
   * @returns Numbers of the filler episodes.
   * @throws when the list cannot be read or lists no episodes.
   */
  private async fetchFillerEpisodes(mediaId: string, options: CallOptions): Promise<Set<number>> {
    const response = await this.http.get(`${siteUrl}/ajax/episode/list/${encodeURIComponent(mediaId)}`, {
      signal: options.signal,
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

  private embedUrl(unitId: string, language: ContentLanguage) {
    return `https://megaplay.buzz/stream/s-2/${unitId}/${language}`;
  }
}
