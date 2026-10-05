import { describe, expect, test } from "bun:test";

import { InvalidStreamTokenError } from "../../errors";
import { signStreamTarget, verifyStreamToken, type StreamTarget } from "./token";

const secret = "test-secret-that-is-at-least-32-characters";
const target: StreamTarget = {
	url: "https://cdn.example.com/show/master.m3u8",
	kind: "playlist",
	headers: {
		Referer: "https://example.com/",
	},
	mirrors: ["https://mirror.example.com/show/master.m3u8"],
	accountId: "account",
	expiresAt: 2_000_000_000,
};

describe("stream tokens", () => {
	test("round-trip a target", () => {
		const token = signStreamTarget(target, secret);
		expect(verifyStreamToken(token, secret, new Date(0))).toEqual(target);
	});

	test("are URL-safe", () => {
		expect(signStreamTarget(target, secret)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
	});

	test("show nothing of the target", () => {
		const token = signStreamTarget(target, secret);
		const everything = Buffer.from(token.replaceAll(".", ""), "base64url").toString("latin1");

		for (const secretPart of [
			"cdn.example.com",
			"mirror.example.com",
			"Referer",
			"account",
			"master.m3u8",
		]) {
			expect(token).not.toContain(secretPart);
			expect(everything).not.toContain(secretPart);
		}
	});

	test("differ between two tokens for the same target", () => {
		expect(signStreamTarget(target, secret)).not.toBe(signStreamTarget(target, secret));
	});

	test("reject a tampered token", () => {
		const [vector, sealed] = signStreamTarget(target, secret).split(".");
		const bytes = Buffer.from(sealed!, "base64url");
		bytes[3] = bytes[3]! ^ 1;

		expect(() =>
			verifyStreamToken(`${vector}.${bytes.toString("base64url")}`, secret, new Date(0)),
		).toThrow(InvalidStreamTokenError);
	});

	test("reject a payload someone made up", () => {
		const forged = Buffer.from(
			JSON.stringify({
				u: "http://169.254.169.254/latest/meta-data",
				k: "file",
				h: {},
				m: [],
				a: "account",
				e: 2_000_000_000,
			}),
		).toString("base64url");

		expect(() => verifyStreamToken(`${forged}.${forged}`, secret, new Date(0))).toThrow(
			InvalidStreamTokenError,
		);
	});

	test("reject a token signed with another secret", () => {
		const token = signStreamTarget(target, "another-secret-that-is-at-least-32-chars");
		expect(() => verifyStreamToken(token, secret, new Date(0))).toThrow(InvalidStreamTokenError);
	});

	test("reject an expired token", () => {
		const token = signStreamTarget(target, secret);
		expect(() => verifyStreamToken(token, secret, new Date(target.expiresAt * 1_000))).toThrow(
			"expired",
		);
	});

	test("reject malformed input", () => {
		expect(() => verifyStreamToken("not-a-token", secret)).toThrow(InvalidStreamTokenError);
		expect(() => verifyStreamToken("a.b.c", secret)).toThrow(InvalidStreamTokenError);
	});
});
