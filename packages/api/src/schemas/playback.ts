import { z } from "@hono/zod-openapi";
import type { Playback, SkipSegment } from "@sora/core/playback";

export const LanguageSchema = z.enum([
  "sub",
  "dub",
  "raw"
]);

export const PlaybackSchema = z
  .object({
    seasonId: z.string(),
    episode: z.number().int(),
    language: LanguageSchema,
    provider: z.string().openapi({
      description: "The provider that served this playback."
    }),
    sources: z
      .array(
        z.object({
          token: z.string().openapi({
            description: "Stream token; fetch it from `GET /streams/{token}`."
          }),
          format: z.enum([
            "hls",
            "mp4"
          ]),
          quality: z.enum([
            "auto",
            "1080p",
            "720p",
            "480p",
            "360p"
          ])
        })
      )
      .openapi({
        description: "Ordered best first."
      }),
    subtitles: z.array(
      z.object({
        token: z.string(),
        language: z.string().openapi({
          description: "BCP 47 language tag.",
          example: "en"
        }),
        label: z.string(),
        format: z
          .enum([
            "vtt",
            "srt",
            "ass"
          ])
          .nullable()
      })
    )
  })
  .openapi("Playback") satisfies z.ZodType<Playback>;

export const SkipSegmentSchema = z
  .object({
    kind: z.enum([
      "opening",
      "ending",
      "recap"
    ]),
    mixed: z.boolean().openapi({
      description: "The song plays over story content, so skipping may lose scenes."
    }),
    start: z.number(),
    end: z.number(),
    episodeLength: z.number().openapi({
      description: "Length of the encode the segment was timed against, in seconds."
    })
  })
  .openapi("SkipSegment") satisfies z.ZodType<SkipSegment>;
