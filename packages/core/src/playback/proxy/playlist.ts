import type { StreamTargetKind } from "./token";

/** Produces the replacement URI for one upstream resource referenced by a playlist. */
export type PlaylistUriSigner = (url: string, kind: StreamTargetKind) => string;

/**
 * Rewrites every URI in an HLS playlist through `sign`.
 *
 * Relative URIs are resolved against `playlistUrl` first. In a master
 * playlist, variant streams and renditions are marked `playlist`; in a media
 * playlist, segments and `EXT-X-MAP` sections are marked `segment` and
 * `EXT-X-KEY` URIs are marked `key`. Comments, tags, and blank lines are
 * preserved.
 *
 * @example
 * ```ts
 * rewritePlaylist(text, "https://cdn.example/show/index.m3u8", (url, kind) => sign(url, kind));
 * ```
 */
export function rewritePlaylist(content: string, playlistUrl: string, sign: PlaylistUriSigner) {
  const isMaster = /^#EXT-X-(STREAM-INF|MEDIA|I-FRAME-STREAM-INF):/m.test(content);
  const lineKind: StreamTargetKind = isMaster ? "playlist" : "segment";
  const resolve = (uri: string) => new URL(uri, playlistUrl).toString();

  return content
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return line;
      }

      if (!trimmed.startsWith("#")) {
        return sign(resolve(trimmed), lineKind);
      }

      const kind = tagUriKind(trimmed);
      if (!kind) {
        return line;
      }

      return line.replace(/URI="([^"]+)"/, (_match, uri: string) => `URI="${sign(resolve(uri), kind)}"`);
    })
    .join("\n");
}

function tagUriKind(tag: string): StreamTargetKind | null {
  if (tag.startsWith("#EXT-X-MEDIA:") || tag.startsWith("#EXT-X-I-FRAME-STREAM-INF:")) {
    return "playlist";
  }

  if (tag.startsWith("#EXT-X-MAP:")) {
    return "segment";
  }

  if (tag.startsWith("#EXT-X-KEY:") || tag.startsWith("#EXT-X-SESSION-KEY:")) {
    return "key";
  }

  return null;
}
