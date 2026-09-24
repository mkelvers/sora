import {
  AnikotoProvider,
  unwrapUrn,
  type CallOptions,
  type ContentLanguage,
  type ResolvedMediaStream
} from "anime-sdk";

import { fetchMegaPlaySources, resolveMegaPlayEmbed } from "./megaplay";

/** MegaPlay checks that its player is embedded by AniKoto. */
const embedReferer = "https://anikototv.to/";

/** An opening or ending span AniKoto reports, in seconds from the start. */
export interface AniKotoSkipSpan {
  kind: "opening" | "ending";
  start: number;
  end: number;
}

/** AniKoto with MegaPlay's encrypted source payload handled; see {@link resolveMegaPlayEmbed}. */
export class AniKotoStreamProvider extends AnikotoProvider {
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

  private embedUrl(unitId: string, language: ContentLanguage) {
    return `https://megaplay.buzz/stream/s-2/${unitId}/${language}`;
  }
}
