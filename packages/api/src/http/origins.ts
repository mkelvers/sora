/**
 * Origin patterns for browser clients, such as `https://*.mkelvers.tech` or
 * `http://localhost:5173`.
 *
 * A pattern is a scheme, a host, and an optional port. A host starting with
 * `*.` matches any subdomain at any depth, but not the bare domain itself:
 * `https://*.mkelvers.tech` matches `https://app.mkelvers.tech`, not
 * `https://mkelvers.tech`. Scheme and port must match exactly, so
 * `https://*.mkelvers.tech` never matches plain HTTP.
 */
export interface OriginPattern {
  protocol: "http:" | "https:";
  /** The host without `*.`, lowercased. */
  host: string;
  /** Whether subdomains of `host` match rather than `host` itself. */
  isWildcard: boolean;
  /** The port as the URL spells it; empty for the scheme's default. */
  port: string;
  /** The pattern as written, for Better Auth, which understands the same syntax. */
  source: string;
}

const patternSyntax = /^(https?):\/\/(\*\.)?([a-z0-9-]+(?:\.[a-z0-9-]+)*)(?::(\d{1,5}))?$/i;

/**
 * Parses one origin pattern.
 *
 * @throws {TypeError} when the pattern is not a scheme, host, and optional
 *   port, such as when it has a path or a wildcard anywhere but the start.
 */
export function parseOriginPattern(source: string): OriginPattern {
  const match = patternSyntax.exec(source.trim());
  if (!match) {
    throw new TypeError(`"${source}" is not an origin pattern such as https://*.example.com or http://localhost:5173`);
  }

  const [, scheme, wildcard, host, port] = match;
  const protocol = `${scheme!.toLowerCase()}:` as OriginPattern["protocol"];
  const isDefaultPort = (protocol === "https:" && port === "443") || (protocol === "http:" && port === "80");
  return {
    protocol,
    host: host!.toLowerCase(),
    isWildcard: wildcard !== undefined,
    port: port === undefined || isDefaultPort ? "" : port,
    source: source.trim()
  };
}

/** Whether a request's `Origin` header matches any of the patterns. */
export function isTrustedOrigin(origin: string, patterns: readonly OriginPattern[]) {
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }

  // An origin is exactly scheme, host, and port; anything more is not one.
  if (url.origin !== origin) {
    return false;
  }

  const host = url.hostname.toLowerCase();
  return patterns.some(
    (pattern) =>
      url.protocol === pattern.protocol &&
      url.port === pattern.port &&
      (pattern.isWildcard ? host.endsWith(`.${pattern.host}`) : host === pattern.host)
  );
}
