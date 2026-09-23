import { AnikotoProvider, type CallOptions, type ContentLanguage, type ResolvedMediaStream } from "anime-sdk";

import { resolveMegaPlayEmbed } from "./megaplay";

/** AniKoto with MegaPlay's encrypted source payload handled; see {@link resolveMegaPlayEmbed}. */
export class AniKotoStreamProvider extends AnikotoProvider {
  protected override resolveStreamRaw(
    unitId: string,
    language: ContentLanguage = "sub",
    options: CallOptions = {}
  ): Promise<ResolvedMediaStream> {
    return resolveMegaPlayEmbed(
      this.http,
      `https://megaplay.buzz/stream/s-2/${unitId}/${language}`,
      "https://anikototv.to/",
      language,
      options.signal
    );
  }
}
