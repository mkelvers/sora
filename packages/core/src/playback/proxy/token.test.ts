import { describe, expect, test } from "bun:test";

import { InvalidStreamTokenError } from "../../errors";
import { signStreamTarget, verifyStreamToken, type StreamTarget } from "./token";

const secret = "test-secret-that-is-at-least-32-characters";
const target: StreamTarget = {
  url: "https://cdn.example.com/show/master.m3u8",
  kind: "playlist",
  headers: {
    Referer: "https://example.com/"
  },
  mirrors: ["https://mirror.example.com/show/master.m3u8"],
  expiresAt: 2_000_000_000
};

describe("stream tokens", () => {
  test("round-trip a target", () => {
    const token = signStreamTarget(target, secret);
    expect(verifyStreamToken(token, secret, new Date(0))).toEqual(target);
  });

  test("are URL-safe", () => {
    expect(signStreamTarget(target, secret)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  });

  test("reject a tampered payload", () => {
    const [, signature] = signStreamTarget(target, secret).split(".");
    const forged = Buffer.from(JSON.stringify({
      u: "http://169.254.169.254/latest/meta-data",
      k: "file",
      h: {},
      m: [],
      e: 2_000_000_000
    })).toString("base64url");

    expect(() => verifyStreamToken(`${forged}.${signature}`, secret, new Date(0))).toThrow(InvalidStreamTokenError);
  });

  test("reject a token signed with another secret", () => {
    const token = signStreamTarget(target, "another-secret-that-is-at-least-32-chars");
    expect(() => verifyStreamToken(token, secret, new Date(0))).toThrow(InvalidStreamTokenError);
  });

  test("reject an expired token", () => {
    const token = signStreamTarget(target, secret);
    expect(() => verifyStreamToken(token, secret, new Date(target.expiresAt * 1_000))).toThrow("expired");
  });

  test("reject malformed input", () => {
    expect(() => verifyStreamToken("not-a-token", secret)).toThrow(InvalidStreamTokenError);
    expect(() => verifyStreamToken("a.b.c", secret)).toThrow(InvalidStreamTokenError);
  });
});
