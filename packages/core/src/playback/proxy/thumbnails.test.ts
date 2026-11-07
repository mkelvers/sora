import { describe, expect, test } from "bun:test";

import { rewriteThumbnails } from "./thumbnails";

const file = "https://cdn.example/show/preview/thumbnails.vtt";

describe("rewriteThumbnails", () => {
	test("signs each sprite and keeps its region", () => {
		const content = [
			"WEBVTT",
			"",
			"NOTE This is a thumbnail VTT file",
			"",
			"00:00:00.000 --> 00:00:05.000",
			"thumbnails/sprite_0.webp#xywh=0,0,160,90",
			"",
			"00:00:05.000 --> 00:00:10.000",
			"https://other.example/sprite_1.webp#xywh=160,0,160,90",
		].join("\n");

		expect(rewriteThumbnails(content, file, (url) => `signed(${url})`)).toBe(
			[
				"WEBVTT",
				"",
				"NOTE This is a thumbnail VTT file",
				"",
				"00:00:00.000 --> 00:00:05.000",
				"signed(https://cdn.example/show/preview/thumbnails/sprite_0.webp)#xywh=0,0,160,90",
				"",
				"00:00:05.000 --> 00:00:10.000",
				"signed(https://other.example/sprite_1.webp)#xywh=160,0,160,90",
			].join("\n"),
		);
	});

	test("signs a sprite once however many cues use it", () => {
		const content = [
			"WEBVTT",
			"",
			"00:00:00.000 --> 00:00:05.000",
			"sprite_0.webp#xywh=0,0,160,90",
			"",
			"00:00:05.000 --> 00:00:10.000",
			"sprite_0.webp#xywh=160,0,160,90",
			"",
			"00:00:10.000 --> 00:00:15.000",
			"sprite_1.webp#xywh=0,0,160,90",
		].join("\n");
		let count = 0;

		const rewritten = rewriteThumbnails(content, file, () => `token${(count += 1)}`);

		expect(rewritten).toContain("token1#xywh=0,0,160,90");
		expect(rewritten).toContain("token1#xywh=160,0,160,90");
		expect(rewritten).toContain("token2#xywh=0,0,160,90");
		expect(count).toBe(2);
	});

	test("signs the whole image of a cue that has no region", () => {
		const content = [
			"WEBVTT",
			"",
			"1",
			"00:00:00.000 --> 00:00:05.000",
			"thumbs/0001.jpg",
			"",
			"2",
			"00:00:05.000 --> 00:00:10.000",
			"/abs/0002.jpg",
		].join("\n");

		expect(rewriteThumbnails(content, file, (url) => `signed(${url})`)).toBe(
			[
				"WEBVTT",
				"",
				"1",
				"00:00:00.000 --> 00:00:05.000",
				"signed(https://cdn.example/show/preview/thumbs/0001.jpg)",
				"",
				"2",
				"00:00:05.000 --> 00:00:10.000",
				"signed(https://cdn.example/abs/0002.jpg)",
			].join("\n"),
		);
	});

	test("leaves cue identifiers, notes and text payloads alone", () => {
		const content = [
			"WEBVTT",
			"",
			"NOTE thumbs/0000.jpg",
			"",
			"thumbs/0001.jpg",
			"00:00:00.000 --> 00:00:05.000",
			"not an image",
			"",
			"00:00:05.000 --> 00:00:10.000",
			"http://",
		].join("\n");

		expect(rewriteThumbnails(content, file, () => "signed")).toBe(content);
	});
});
