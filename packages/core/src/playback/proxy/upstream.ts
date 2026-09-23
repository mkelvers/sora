import { isIP } from "node:net";

import { CoreError, InvalidStreamTokenError } from "../../errors";
import { second } from "../../time";
import type { StreamTarget } from "./token";

const upstreamTimeoutMs = 15 * second;
const maximumRedirects = 5;

/** The proxied upstream could not be fetched. Retryable. */
export class StreamUpstreamError extends CoreError {
  readonly status: number | null;

  constructor(message: string, status: number | null, options?: ErrorOptions) {
    super("UPSTREAM_UNAVAILABLE", message, options);
    this.status = status;
  }
}

/** A successful upstream response. */
export interface Upstream {
  response: Response;
  /** Final URL after redirects, used to resolve relative playlist URIs. */
  url: string;
}

/**
 * Fetches a target, falling back to its mirrors in order when the primary
 * host is unreachable or answers with an error.
 *
 * @throws {@link StreamUpstreamError} with the primary host's failure when
 *   every candidate fails.
 */
export async function fetchUpstream(target: StreamTarget, range: string | null, signal?: AbortSignal): Promise<Upstream> {
  const headers = new Headers(target.headers);
  if (range) {
    headers.set("Range", range);
  }

  try {
    return await fetchFollowingRedirects(target.url, headers, signal);
  } catch (cause) {
    if (!(cause instanceof StreamUpstreamError)) {
      throw cause;
    }

    for (const mirror of target.mirrors) {
      try {
        return await fetchFollowingRedirects(mirror, headers, signal);
      } catch (mirrorCause) {
        if (!(mirrorCause instanceof StreamUpstreamError)) {
          throw mirrorCause;
        }
      }
    }

    // The primary host's failure is the one worth reporting.
    throw cause;
  }
}

/**
 * Proposes the playlist's own host as a mirror for a child URI on another host.
 *
 * Stream CDNs shard segments across many hostnames; individual shards are
 * often unreachable (dead, geo-blocked, or DNS-filtered) while the host that
 * served the playlist carries the same paths.
 */
export function mirrorsFor(url: string, playlistUrl: string) {
  const child = new URL(url);
  const parent = new URL(playlistUrl);
  if (child.host === parent.host) {
    return [];
  }

  return [new URL(`${child.pathname}${child.search}`, parent.origin).toString()];
}

async function fetchFollowingRedirects(start: string, headers: Headers, signal?: AbortSignal): Promise<Upstream> {
  let url = start;

  for (let redirects = 0; redirects <= maximumRedirects; redirects += 1) {
    assertPublicHttpUrl(url);

    let response: Response;
    try {
      response = await fetch(url, {
        headers,
        redirect: "manual",
        signal: signal
          ? AbortSignal.any([
              signal,
              AbortSignal.timeout(upstreamTimeoutMs)
            ])
          : AbortSignal.timeout(upstreamTimeoutMs)
      });
    } catch (cause) {
      throw new StreamUpstreamError(`Upstream ${new URL(url).host} could not be reached`, null, {
        cause
      });
    }

    const location = response.headers.get("Location");
    if (response.status >= 300 && response.status < 400 && location) {
      // Each hop is re-checked, so a redirect cannot reach a private address.
      url = new URL(location, url).toString();
      continue;
    }

    if (!response.ok) {
      throw new StreamUpstreamError(`Upstream ${new URL(url).host} returned ${response.status}`, response.status);
    }

    return {
      response,
      url
    };
  }

  throw new StreamUpstreamError("Upstream stream redirected too many times", null);
}

/**
 * Rejects URLs the proxy must never fetch: non-HTTP schemes, loopback, and
 * private or link-local IP literals.
 *
 * Tokens are signed, but playlist URIs come from third-party servers, so a
 * hostile playlist could otherwise point the proxy at internal services.
 * Hostnames that resolve to private addresses via DNS are not covered.
 */
function assertPublicHttpUrl(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new InvalidStreamTokenError("Stream target must use HTTP");
  }

  const host = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
    throw new InvalidStreamTokenError("Stream target is not a public host");
  }

  const version = isIP(host);
  const privateAddress =
    version === 4
      ? /^(0|10|127|169\.254|172\.(1[6-9]|2\d|3[01])|192\.168|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7]))\./.test(host)
      : version === 6 && /^(::1?$|f[cd]|fe[89ab]|::ffff:)/.test(host);

  if (privateAddress) {
    throw new InvalidStreamTokenError("Stream target is not a public host");
  }
}
