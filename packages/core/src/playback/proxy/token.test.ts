import { describe, expect, test } from "bun:test";

import { StreamTokenError } from "../../errors";
import { StreamToken } from "./token";
import type { StreamTarget } from "./token";

const tokens = new StreamToken("test-secret-that-is-at-least-32-characters");

const target: StreamTarget = {
	accountId: "account",
	expiresAt: 2_000_000_000,
	headers: {
		Referer: "https://example.com/",
	},
	kind: "playlist",
	mirrors: ["https://mirror.example.com/show/master.m3u8"],
	url: "https://cdn.example.com/show/master.m3u8",
};

describe("stream tokens", () => {
	test("round-trip a target", () => {
		const token = tokens.sign(target);
		expect(tokens.verify(token, new Date(0))).toEqual(target);
	});

	test("round-trip the shifts and stored refinement of a retimed subtitle", () => {
		const retimed: StreamTarget = {
			...target,
			kind: "subtitle",
			refinement: "f00d",
			shifts: [
				{
					from: 0,
					offset: 2.5,
				},
			],
		};

		expect(tokens.verify(tokens.sign(retimed), new Date(0))).toEqual(retimed);
	});

	test("round-trip the audio a dub's playlist starts with", () => {
		const dubbed: StreamTarget = {
			...target,
			audio: "en",
		};

		expect(tokens.verify(tokens.sign(dubbed), new Date(0))).toEqual(dubbed);
	});

	test("are URL-safe", () => {
		expect(tokens.sign(target)).toMatch(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u);
	});

	test("show nothing of the target", () => {
		const token = tokens.sign(target);
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
		expect(tokens.sign(target)).not.toBe(tokens.sign(target));
	});

	test("reject a tampered token", () => {
		const [vector, sealed] = tokens.sign(target).split(".");
		const bytes = Buffer.from(sealed ?? "", "base64url");
		bytes.writeUInt8((bytes.readUInt8(3) + 1) % 256, 3);

		expect(() => tokens.verify(`${vector}.${bytes.toString("base64url")}`, new Date(0))).toThrow(
			StreamTokenError,
		);
	});

	test("reject a payload someone made up", () => {
		const forged = Buffer.from(
			JSON.stringify({
				a: "account",
				e: 2_000_000_000,
				h: {},
				k: "file",
				m: [],
				u: "http://169.254.169.254/latest/meta-data",
			}),
		).toString("base64url");

		expect(() => tokens.verify(`${forged}.${forged}`, new Date(0))).toThrow(StreamTokenError);
	});

	test("reject a token signed with another secret", () => {
		const token = new StreamToken("another-secret-that-is-at-least-32-chars").sign(target);
		expect(() => tokens.verify(token, new Date(0))).toThrow(StreamTokenError);
	});

	test("reject an expired token", () => {
		const token = tokens.sign(target);
		expect(() => tokens.verify(token, new Date(target.expiresAt * 1000))).toThrow("expired");
	});

	test("reject malformed input", () => {
		expect(() => tokens.verify("not-a-token")).toThrow(StreamTokenError);
		expect(() => tokens.verify("a.b.c")).toThrow(StreamTokenError);
	});
});
