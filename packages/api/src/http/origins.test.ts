import { describe, expect, test } from "bun:test";

import { isTrustedOrigin, parseOriginPattern } from "./origins";

const patterns = [
  "https://*.mkelvers.tech",
  "http://localhost:3000",
  "http://localhost:5173"
].map(parseOriginPattern);

describe("isTrustedOrigin", () => {
  test("trusts any HTTPS subdomain of a wildcard domain", () => {
    expect(isTrustedOrigin("https://app.mkelvers.tech", patterns)).toBe(true);
    expect(isTrustedOrigin("https://beta.app.mkelvers.tech", patterns)).toBe(true);
  });

  test("does not trust the bare domain of a wildcard", () => {
    expect(isTrustedOrigin("https://mkelvers.tech", patterns)).toBe(false);
  });

  test("does not trust a wildcard domain over plain HTTP or another port", () => {
    expect(isTrustedOrigin("http://app.mkelvers.tech", patterns)).toBe(false);
    expect(isTrustedOrigin("https://app.mkelvers.tech:8443", patterns)).toBe(false);
  });

  test("does not trust look-alike domains", () => {
    expect(isTrustedOrigin("https://evilmkelvers.tech", patterns)).toBe(false);
    expect(isTrustedOrigin("https://mkelvers.tech.evil.com", patterns)).toBe(false);
  });

  test("trusts exact origins only on their own port", () => {
    expect(isTrustedOrigin("http://localhost:5173", patterns)).toBe(true);
    expect(isTrustedOrigin("http://localhost:3000", patterns)).toBe(true);
    expect(isTrustedOrigin("http://localhost:4000", patterns)).toBe(false);
    expect(isTrustedOrigin("https://localhost:5173", patterns)).toBe(false);
  });

  test("rejects values that are not origins", () => {
    expect(isTrustedOrigin("null", patterns)).toBe(false);
    expect(isTrustedOrigin("http://localhost:5173/path", patterns)).toBe(false);
  });
});

describe("parseOriginPattern", () => {
  test("drops a scheme's default port", () => {
    expect(parseOriginPattern("https://*.mkelvers.tech:443").port).toBe("");
  });

  test("rejects patterns with paths or inner wildcards", () => {
    expect(() => parseOriginPattern("https://mkelvers.tech/app")).toThrow(TypeError);
    expect(() => parseOriginPattern("https://app.*.mkelvers.tech")).toThrow(TypeError);
  });
});
