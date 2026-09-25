import { config } from "../../config";
import { hour } from "../../time";
import { rewritePlaylist } from "./playlist";
import { isDisguisedSegment, unwrapDisguisedSegment } from "./segment";
import { signStreamTarget, verifyStreamToken, type StreamTarget, type StreamTargetKind } from "./token";
import { fetchUpstream, mirrorsFor, StreamUpstreamError, type Upstream } from "./upstream";

/**
 * How long tokens handed to clients stay valid.
 *
 * Long enough to finish a movie after pausing; short enough that a leaked
 * link stops working the same day.
 */
export const tokenLifetimeMs = 6 * hour;

/** Playlists are buffered for rewriting; anything larger is not a playlist. */
const maximumPlaylistBytes = 4 * 1_024 * 1_024;

/**
 * Issues a token that lets clients fetch `url` through {@link proxyStream}.
 *
 * Clients never see upstream headers; the proxy applies them.
 */
export function createStreamToken(url: string, kind: StreamTargetKind, headers: Record<string, string>, mirrors: string[] = []) {
  return signStreamTarget(
    {
      url,
      kind,
      headers,
      mirrors,
      expiresAt: Math.floor((Date.now() + tokenLifetimeMs) / 1_000)
    },
    config.streamSigningSecret
  );
}

/** Whether the proxy could serve `url` right now, from its own host or a mirror. */
export async function canFetchStream(url: string, headers: Record<string, string>, mirrors: string[]) {
  try {
    const { response } = await fetchUpstream({ url, kind: "subtitle", headers, mirrors, expiresAt: 0 }, null);
    await response.body?.cancel();
    return true;
  } catch (cause) {
    if (cause instanceof StreamUpstreamError) {
      return false;
    }
    throw cause;
  }
}

/**
 * Serves one proxied stream resource.
 *
 * Mount this so the token is the last path segment under a fixed prefix, for
 * example `GET /stream/:token`. Rewritten playlists reference their children
 * with bare relative tokens, which only resolve correctly under that layout.
 *
 * `Range` is forwarded so players can seek in progressive files.
 *
 * @throws {@link InvalidStreamTokenError} for a forged, malformed, or expired token.
 * @throws {@link StreamUpstreamError} when the upstream and its mirrors fail.
 */
export async function proxyStream(
  token: string,
  request: {
    range: string | null;
    signal?: AbortSignal;
  }
): Promise<Response> {
  const target = verifyStreamToken(token, config.streamSigningSecret);
  const upstream = await fetchUpstream(target, request.range, request.signal);

  if (target.kind === "playlist") {
    return playlistResponse(target, upstream);
  }

  const headers = new Headers({
    "Cache-Control": "private, max-age=3600"
  });
  for (const name of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
    const value = upstream.response.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }

  // Some hosts disguise TS segments as images to pass CDN filters. Strict
  // players (AVPlayer, ExoPlayer) reject that type, so restore the real one.
  const contentType = headers.get("Content-Type");
  if (target.kind === "segment" && contentType && /^(image|text)\//i.test(contentType)) {
    headers.set("Content-Type", "video/mp2t");
  }

  // A ranged response cannot be unwrapped without breaking its byte offsets.
  if (target.kind === "segment" && upstream.response.status === 200 && upstream.response.body) {
    return segmentResponse(upstream.response.body, headers);
  }

  return new Response(upstream.response.body, {
    status: upstream.response.status,
    headers
  });
}

/**
 * Streams a segment through unchanged unless it starts with a disguising
 * image header, in which case it is buffered and the image removed.
 */
async function segmentResponse(body: ReadableStream<Uint8Array>, headers: Headers) {
  const reader = body.getReader();
  const first = await reader.read();
  if (first.done) {
    return new Response(null, {
      status: 200,
      headers
    });
  }

  if (isDisguisedSegment(first.value)) {
    const chunks = [first.value];
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      chunks.push(chunk.value);
    }

    const segment = unwrapDisguisedSegment(Buffer.concat(chunks));
    headers.set("Content-Type", "video/mp2t");
    headers.set("Content-Length", String(segment.byteLength));
    return new Response(segment, {
      status: 200,
      headers
    });
  }

  return new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(first.value);
      },
      async pull(controller) {
        const chunk = await reader.read();
        if (chunk.done) {
          controller.close();
        } else {
          controller.enqueue(chunk.value);
        }
      },
      cancel(reason) {
        return reader.cancel(reason);
      }
    }),
    {
      status: 200,
      headers
    }
  );
}

async function playlistResponse(target: StreamTarget, upstream: Upstream) {
  const length = Number(upstream.response.headers.get("Content-Length"));
  if (length > maximumPlaylistBytes) {
    throw new StreamUpstreamError("Upstream playlist is too large", upstream.response.status);
  }

  const content = await upstream.response.text();
  if (!content.trimStart().startsWith("#EXTM3U")) {
    throw new StreamUpstreamError("Upstream did not return an HLS playlist", upstream.response.status);
  }

  // Children inherit the parent's headers and expiry, so a playlist cannot be
  // used to mint tokens that outlive the one the client was given.
  const rewritten = rewritePlaylist(content, upstream.url, (url, kind) =>
    signStreamTarget(
      {
        url,
        kind,
        headers: target.headers,
        mirrors: mirrorsFor(url, upstream.url),
        expiresAt: target.expiresAt
      },
      config.streamSigningSecret
    )
  );

  return new Response(rewritten, {
    status: 200,
    headers: {
      "Content-Type": "application/vnd.apple.mpegurl",
      // Live playlists change; media playlists for VOD are cheap to refetch.
      "Cache-Control": "no-cache"
    }
  });
}
