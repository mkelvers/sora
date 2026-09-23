import { createDecipheriv } from "node:crypto";

import {
  labelToBcp47,
  MegaPlayProvider,
  type CallOptions,
  type ContentLanguage,
  type HttpClient,
  type ResolvedMediaStream
} from "anime-sdk";
import { z } from "zod";

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
      .optional()
  })
  .refine((body) => body.sources !== undefined || body.enc !== undefined, {
    message: "MegaPlay returned neither sources nor enc"
  });

const EncryptedSourceSchema = z.object({
  file: z.string().min(1)
});

/**
 * Resolves a MegaPlay embed page into playable streams.
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
  language: ContentLanguage,
  signal?: AbortSignal
): Promise<ResolvedMediaStream> {
  const embedPage = await (
    await http.get(embedUrl, {
      signal,
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
    signal,
    headers: {
      Referer: embedUrl,
      "X-Requested-With": "XMLHttpRequest"
    }
  });
  const body = SourcesResponseSchema.parse(await response.json());

  const file = body.sources?.file ?? (body.enc ? decryptSourceFile(body.enc) : null);
  if (!file) {
    throw new Error("MegaPlay returned no source URL");
  }

  const headers = {
    Referer: mediaReferer
  };

  return {
    type: "video",
    streams: [
      {
        sourceUrl: file,
        isHLS: new URL(file).pathname.endsWith(".m3u8"),
        quality: "auto",
        language,
        headers,
        subtitles: (body.tracks ?? []).flatMap((track) =>
          track.kind === "captions" && track.label
            ? [
                {
                  url: track.file,
                  label: track.label,
                  language: labelToBcp47(track.label),
                  format: track.file.endsWith(".vtt") ? ("vtt" as const) : ("srt" as const)
                }
              ]
            : []
        )
      }
    ]
  };
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

/** MegaPlay with its encrypted source payload handled; see {@link resolveMegaPlayEmbed}. */
export class MegaPlayStreamProvider extends MegaPlayProvider {
  protected override resolveStreamRaw(
    unitId: string,
    language: ContentLanguage = "sub",
    options: CallOptions = {}
  ): Promise<ResolvedMediaStream> {
    // Unit IDs are `<anilistId>:<episode>`.
    const [anilistId, episode] = unitId.split(":");
    return resolveMegaPlayEmbed(
      this.http,
      `https://megaplay.buzz/stream/ani/${anilistId}/${episode}/${language}`,
      "https://megaplay.buzz/",
      language,
      options.signal
    );
  }
}
