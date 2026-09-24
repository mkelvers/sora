import type { Context } from "hono";
import { getConnInfo } from "hono/bun";

import { config } from "../config";

/**
 * The address of the client making the request.
 *
 * Behind a trusted proxy (`TRUST_PROXY`), the first `X-Forwarded-For`
 * address, which the proxy set; otherwise the socket's peer address.
 */
export function clientAddress(c: Context): string {
  if (config.trustProxy) {
    const forwarded = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
    if (forwarded) {
      return forwarded;
    }
  }

  return getConnInfo(c).remote.address ?? "unknown";
}
