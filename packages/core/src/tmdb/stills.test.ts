import { describe, expect, test } from "bun:test";

import { defined } from "@sora/shared";
import sharp from "sharp";

import type { TmdbImage } from "./resources";
import { blackBars, hasBlackBars, bestFirst } from "./stills";

const base: Omit<TmdbImage, "file_path"> = {
	height: 1080,
	iso_639_1: null,
	vote_average: 0,
	vote_count: 0,
	width: 1920,
};

/** A busy 16:9 frame: noise over a gradient, so no edge of it is black. */
class Busy {
	readonly #width = 1280;
	readonly #height = 720;

	image() {
		const pixels = Buffer.alloc(this.#width * this.#height * 3);

		for (let index = 0; index < pixels.length; index += 1) {
			pixels[index] = 60 + ((index * 7919) % 120);
		}

		return Promise.resolve(
			sharp(pixels, {
				raw: {
					channels: 3,
					height: this.#height,
					width: this.#width,
				},
			})
				.png()
				.toBuffer(),
		);
	}

	/** The frame with black bars `top` pixels high above and below it, or `left` wide beside it. */
	async withBars(bars: { top?: number; left?: number }) {
		const image = await this.image();
		const meta = await sharp(image).metadata();
		const top = bars.top ?? 0;
		const left = bars.left ?? 0;

		return sharp(image)
			.extract({
				height: defined(meta.height) - 2 * top,
				left,
				top,
				width: defined(meta.width) - 2 * left,
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
}

const busy = new Busy();

describe("rankStills", () => {
	test("puts stills without a language before those with one, whatever the votes", () => {
		const ranked = bestFirst(
			[
				{
					...base,
					file_path: "/logo.jpg",
					iso_639_1: "ja",
					vote_average: 9,
				},
				{
					...base,
					file_path: "/plain.jpg",
					vote_average: 1,
				},
			],
			null,
		);

		expect(ranked.map((image) => image.file_path)).toEqual(["/plain.jpg", "/logo.jpg"]);
	});

	test("puts widescreen before other shapes, and large before small", () => {
		const ranked = bestFirst(
			[
				{
					...base,
					file_path: "/square.jpg",
					height: 1080,
					vote_average: 5,
					width: 1440,
				},
				{
					...base,
					file_path: "/small.jpg",
					height: 360,
					vote_average: 5,
					width: 640,
				},
				{
					...base,
					file_path: "/wide.jpg",
					vote_average: 1,
				},
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
		const ranked = bestFirst(
			[
				{
					...base,
					file_path: "/a.jpg",
				},
				{
					...base,
					file_path: "/b.jpg",
				},
			],
			"/b.jpg",
		);

		expect(ranked[0]?.file_path).toBe("/b.jpg");
	});
});

describe("blackBars", () => {
	test("finds the bars of a 2.35:1 picture in a 16:9 frame", async () => {
		const bars = await blackBars(await busy.withBars({ top: 88 }));
		expect(bars).toBeGreaterThan(0.1);
		expect(bars).toBeLessThan(0.14);
	});

	test("finds pillarbox bars", async () => {
		expect(await hasBlackBars(await busy.withBars({ left: 240 }))).toBe(true);
	});

	test("finds none in a frame without bars", async () => {
		expect(await hasBlackBars(await busy.image())).toBe(false);
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
