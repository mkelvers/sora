import { createDecipheriv } from "node:crypto";

import { labelToBcp47, MegaPlayProvider, type HttpClient, type MappingClient } from "anime-sdk";
import { z } from "zod";

import type { ContentLanguage } from "../../series/models";
import type { ProviderStream, SkipSegment } from "./provider";
import { rawEpisodeId, SdkStreamProvider, type ProviderTraits } from "./sdk";

/**
 * MegaPlay's player script encrypts the source URL into an `enc` field with
 * this fixed AES-256-CBC key and IV. `anime-sdk` only reads the unencrypted
 * `sources.file` field, which MegaPlay no longer sends, so AniKoto and MegaPlay
 * playback goes through this module instead.
 */
const encryptionKey = Buffer.concat([
  Buffer.from("i?LMTAx0Q6,:}50U"),
  Buffer.alloc(16)
]);
const encryptionIv = Buffer.from([87, 48, 59, 50, 55, 84, 111, 97, 85, 112, 108, 95, 80, 37, 39, 99]);

/**
 * A skippable span MegaPlay reports, in seconds. MegaPlay sends `0`–`0` when
 * it knows nothing, so an empty span means no segment.
 */
const SkipSpanSchema = z.object({
  start: z.number().nonnegative(),
  end: z.number().nonnegative()
});

/** MegaPlay's CDNs reject media requests without this referer. */
const mediaReferer = "https://megaplay.buzz/";

const SourcesResponseSchema = z
  .object({
    sources: z
      .object({
        file: z.string().min(1)
      })
      .optional(),
    enc: z.string().min(1).optional(),
    tracks: z
      .array(
        z.object({
          file: z.string().min(1),
          label: z.string().optional(),
          kind: z.string().optional()
        })
      )
      .optional(),
    // Skip spans only enhance playback, so a malformed one is dropped rather
    // than failing the stream.
    intro: SkipSpanSchema.optional().catch(undefined),
    outro: SkipSpanSchema.optional().catch(undefined)
  })
  .refine((body) => body.sources !== undefined || body.enc !== undefined, {
    message: "MegaPlay returned neither sources nor enc"
  });

const EncryptedSourceSchema = z.object({
  file: z.string().min(1)
});

/** The `getSources` payload behind a MegaPlay embed. */
type MegaPlaySources = z.infer<typeof SourcesResponseSchema>;

/**
 * Fetches the `getSources` payload behind a MegaPlay embed page.
 *
 * @param embedUrl - The `megaplay.buzz/stream/...` embed for one episode and language.
 * @param embedReferer - The page that embeds the player; MegaPlay checks it.
 *
 * @throws when the embed or its sources cannot be read.
 */
async function fetchMegaPlaySources(
  http: HttpClient,
  embedUrl: string,
  embedReferer: string,
  language: ContentLanguage
): Promise<MegaPlaySources> {
  const embedPage = await (
    await http.get(embedUrl, {
      headers: {
        Referer: embedReferer
      }
    })
  ).text();

  if (embedPage.includes("<title>Error - MegaPlay</title>")) {
    throw new Error(`MegaPlay has no ${language} source for this episode`);
  }

  const fileId = /<title>\s*File\s+(\d+)\s*-/i.exec(embedPage)?.[1] ?? /data-id="(\d+)"/.exec(embedPage)?.[1];
  if (!fileId) {
    throw new Error("MegaPlay embed page has no file ID");
  }

  const sourcesUrl = new URL("/stream/getSources", embedUrl);
  sourcesUrl.searchParams.set("id", fileId);
  const response = await http.get(sourcesUrl.toString(), {
    headers: {
      Referer: embedUrl,
      "X-Requested-With": "XMLHttpRequest"
    }
  });

  return SourcesResponseSchema.parse(await response.json());
}

/**
 * Resolves a MegaPlay embed page into its stream, with the opening and ending
 * MegaPlay's player ships with it.
 *
 * @param embedUrl - The `megaplay.buzz/stream/...` embed for one episode and language.
 * @param embedReferer - The page that embeds the player; MegaPlay checks it.
 *
 * @throws when the embed or its sources cannot be read.
 */
export async function resolveMegaPlayEmbed(
  http: HttpClient,
  embedUrl: string,
  embedReferer: string,
  language: ContentLanguage
): Promise<ProviderStream> {
  const body = await fetchMegaPlaySources(http, embedUrl, embedReferer, language);

  const file = body.sources?.file ?? (body.enc ? decryptSourceFile(body.enc) : null);
  if (!file) {
    throw new Error("MegaPlay returned no source URL");
  }

  return {
    videos: [
      {
        url: file,
        format: new URL(file).pathname.endsWith(".m3u8") ? "hls" : "mp4",
        quality: "auto",
        headers: {
          Referer: mediaReferer
        },
        subtitles: (body.tracks ?? []).flatMap((track) =>
          track.kind === "captions" && track.label
            ? [
                {
                  url: track.file,
                  label: track.label,
                  language: subtitleLanguage(track.label),
                  format: track.file.endsWith(".vtt") ? ("vtt" as const) : ("srt" as const)
                }
              ]
            : []
        )
      }
    ],
    skipSegments: skipSegments(body)
  };
}

/**
 * The payload's opening and ending. MegaPlay sends `0`–`0` for a span it does
 * not know, and one that ends before it starts is as useless.
 */
function skipSegments({ intro, outro }: MegaPlaySources): SkipSegment[] {
  const segments: SkipSegment[] = [];
  if (intro && intro.end > intro.start) {
    segments.push({
      kind: "opening",
      ...intro
    });
  }
  if (outro && outro.end > outro.start) {
    segments.push({
      kind: "ending",
      ...outro
    });
  }

  // A cold open can put the opening after an early ending card.
  return segments.sort((left, right) => left.start - right.start);
}

/** BCP 47 region subtags for the regions MegaPlay names in subtitle labels. */
const regionSubtags: Record<string, string> = {
  brazil: "BR",
  portugal: "PT",
  "latin america": "419",
  spain: "ES",
  mexico: "MX",
  traditional: "Hant",
  simplified: "Hans"
};

/**
 * The BCP 47 tag for a MegaPlay subtitle label.
 *
 * MegaPlay names regional variants as `Portuguese (- Portuguese(Brazil))`,
 * which `labelToBcp47` does not know and would cut to `po`. The language part
 * goes through `labelToBcp47`; a known region is added as its subtag, and an
 * unknown one is dropped, leaving the plain language.
 */
export function subtitleLanguage(label: string) {
  const regional = /^(.+?)\s*\(\s*-\s*.*\(([^()]+)\)\s*\)$/.exec(label.trim());
  if (!regional?.[1] || !regional[2]) {
    return labelToBcp47(label);
  }

  const language = labelToBcp47(regional[1]);
  const region = regionSubtags[regional[2].trim().toLowerCase()];
  return region ? `${language}-${region}` : language;
}

/**
 * Decrypts MegaPlay's `enc` field into the source file URL. Node's base64
 * decoder accepts both the standard and URL-safe alphabets MegaPlay mixes.
 */
export function decryptSourceFile(encrypted: string) {
  const decipher = createDecipheriv("aes-256-cbc", encryptionKey, encryptionIv);
  const plain = Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64")),
    decipher.final()
  ]).toString("utf8");

  return EncryptedSourceSchema.parse(JSON.parse(plain)).file;
}

/**
 * MegaPlay, whose episode lists are made up from AniList's episode count and
 * whose streams go through {@link resolveMegaPlayEmbed}.
 */
export class MegaPlayStreamProvider extends SdkStreamProvider {
  constructor(
    private readonly http: HttpClient,
    mapping: MappingClient,
    traits: ProviderTraits
  ) {
    super(new MegaPlayProvider(http), mapping, traits);
  }

  override resolveStream(episodeId: string, language: ContentLanguage): Promise<ProviderStream> {
    // Raw episode IDs are `<anilistId>:<episode>`.
    const [anilistId, episode] = rawEpisodeId(this.id, episodeId).split(":");
    return resolveMegaPlayEmbed(
      this.http,
      `https://megaplay.buzz/stream/ani/${anilistId}/${episode}/${language}`,
      "https://megaplay.buzz/",
      language
    );
  }
}
