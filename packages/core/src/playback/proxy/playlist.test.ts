import { describe, expect, test } from "bun:test";

import { rewritePlaylist } from "./playlist";

const sign = (url: string, kind: string) => `<${kind}:${url}>`;

describe("rewritePlaylist", () => {
  test("marks master playlist variants and renditions as playlists", () => {
    const master = [
      "#EXTM3U",
      "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"Japanese\",URI=\"audio/ja.m3u8\"",
      "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
      "1080/index.m3u8",
      "#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720",
      "https://other.example.com/720/index.m3u8"
    ].join("\n");

    expect(rewritePlaylist(master, "https://cdn.example.com/show/master.m3u8", sign)).toBe(
      [
        "#EXTM3U",
        "#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID=\"aud\",NAME=\"Japanese\",URI=\"<playlist:https://cdn.example.com/show/audio/ja.m3u8>\"",
        "#EXT-X-STREAM-INF:BANDWIDTH=5000000,RESOLUTION=1920x1080",
        "<playlist:https://cdn.example.com/show/1080/index.m3u8>",
        "#EXT-X-STREAM-INF:BANDWIDTH=2500000,RESOLUTION=1280x720",
        "<playlist:https://other.example.com/720/index.m3u8>"
      ].join("\n")
    );
  });

  test("marks media playlist segments, init sections, and keys", () => {
    const media = [
      "#EXTM3U",
      "#EXT-X-TARGETDURATION:6",
      "#EXT-X-KEY:METHOD=AES-128,URI=\"/keys/1.key\",IV=0x1",
      "#EXT-X-MAP:URI=\"init.mp4\"",
      "#EXTINF:6.0,",
      "seg-1.ts?token=abc",
      "",
      "#EXT-X-ENDLIST"
    ].join("\r\n");

    expect(rewritePlaylist(media, "https://cdn.example.com/show/1080/index.m3u8", sign)).toBe(
      [
        "#EXTM3U",
        "#EXT-X-TARGETDURATION:6",
        "#EXT-X-KEY:METHOD=AES-128,URI=\"<key:https://cdn.example.com/keys/1.key>\",IV=0x1",
        "#EXT-X-MAP:URI=\"<segment:https://cdn.example.com/show/1080/init.mp4>\"",
        "#EXTINF:6.0,",
        "<segment:https://cdn.example.com/show/1080/seg-1.ts?token=abc>",
        "",
        "#EXT-X-ENDLIST"
      ].join("\n")
    );
  });
});
