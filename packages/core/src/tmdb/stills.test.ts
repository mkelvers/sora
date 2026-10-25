import { describe, expect, test } from "bun:test";

import sharp from "sharp";

import type { TmdbImage } from "./resources";
import { blackBars, hasBlackBars, rankStills } from "./stills";

function still(overrides: Partial<TmdbImage> & Pick<TmdbImage, "file_path">): TmdbImage {
	return {
		height: 1080,
		iso_639_1: null,
		vote_average: 0,
		vote_count: 0,
		width: 1920,
		...overrides,
	};
}

/** A busy 16:9 frame: noise over a gradient, so no edge of it is black. */
async function frame() {
	const width = 1280;
	const height = 720;
	const pixels = Buffer.alloc(width * height * 3);
	for (let index = 0; index < pixels.length; index += 1) {
		pixels[index] = 60 + ((index * 7919) % 120);
	}
	return sharp(pixels, {
		raw: {
			channels: 3,
			height,
			width,
		},
	})
		.png()
		.toBuffer();
}

async function withBars(image: Buffer, bars: { top?: number; left?: number }) {
	const meta = await sharp(image).metadata();
	const top = bars.top ?? 0;
	const left = bars.left ?? 0;
	return sharp(image)
		.extract({
			height: meta.height! - 2 * top,
			left,
			top,
			width: meta.width! - 2 * left,
		})
		.extend({
			background: "#000",
			bottom: top,
			left,
			right: left,
			top,
		})
		.jpeg({
			quality: 70,
		})
		.toBuffer();
}

describe("rankStills", () => {
	test("puts stills without a language before those with one, whatever the votes", () => {
		const ranked = rankStills(
			[
				still({ file_path: "/logo.jpg", iso_639_1: "ja", vote_average: 9 }),
				still({ file_path: "/plain.jpg", vote_average: 1 }),
			],
			null,
		);
		expect(ranked.map((image) => image.file_path)).toEqual(["/plain.jpg", "/logo.jpg"]);
	});

	test("puts widescreen before other shapes, and large before small", () => {
		const ranked = rankStills(
			[
				still({ file_path: "/square.jpg", height: 1080, vote_average: 5, width: 1440 }),
				still({ file_path: "/small.jpg", height: 360, vote_average: 5, width: 640 }),
				still({ file_path: "/wide.jpg", vote_average: 1 }),
			],
			null,
		);
		expect(ranked.map((image) => image.file_path)).toEqual([
			"/wide.jpg",
			"/small.jpg",
			"/square.jpg",
		]);
	});

	test("breaks a tie of votes with TMDB's own pick", () => {
		const ranked = rankStills(
			[still({ file_path: "/a.jpg" }), still({ file_path: "/b.jpg" })],
			"/b.jpg",
		);
		expect(ranked[0]?.file_path).toBe("/b.jpg");
	});
});

describe("blackBars", () => {
	test("finds the bars of a 2.35:1 picture in a 16:9 frame", async () => {
		const bars = await blackBars(await withBars(await frame(), { top: 88 }));
		expect(bars).toBeGreaterThan(0.1);
		expect(bars).toBeLessThan(0.14);
	});

	test("finds pillarbox bars", async () => {
		expect(await hasBlackBars(await withBars(await frame(), { left: 240 }))).toBe(true);
	});

	test("finds none in a frame without bars", async () => {
		expect(await hasBlackBars(await frame())).toBe(false);
	});

	test("does not take a dark scene that fades to black for bars", async () => {
		const width = 640;
		const height = 360;
		const pixels = Buffer.alloc(width * height * 3);
		for (let y = 0; y < height; y += 1) {
			const luma = Math.min(y, height - 1 - y) * 0.5;
			pixels.fill(luma, y * width * 3, (y + 1) * width * 3);
		}
		const image = await sharp(pixels, {
			raw: {
				channels: 3,
				height,
				width,
			},
		})
			.jpeg()
			.toBuffer();
		expect(await hasBlackBars(image)).toBe(false);
	});
});
