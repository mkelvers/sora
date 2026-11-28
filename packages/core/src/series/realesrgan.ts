import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { minute } from "@sora/shared";

import { config } from "../config";
import { heavyWork } from "../heavy-work";

/** A Real-ESRGAN model shipped with the upscaler, and how many times larger it makes a picture. */
export interface Model {
	name: string;
	scale: number;
}

/** The models backdrops are upscaled with, both trained on anime. */
export const models = {
	/**
	 * Light, trained on anime video: sharpens a picture that already has its
	 * detail without painting over it.
	 */
	cleanup: {
		name: "realesr-animevideov3",
		scale: 2,
	},
	/**
	 * Heavier, trained on anime art: redraws the lines and edges a soft
	 * picture lost, but smooths away fine texture, such as hatching, that a
	 * sharp one has. Costs about three times as much per pixel as
	 * {@link models.cleanup}.
	 */
	restore: {
		name: "realesrgan-x4plus-anime",
		scale: 4,
	},
} as const satisfies Record<string, Model>;

/** Upscaling failed: the upscaler is not set up, or it exited with an error. */
export class UpscaleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UpscaleError";
	}
}

/**
 * Upscales a picture with `realesrgan-ncnn-vulkan` and one of {@link models},
 * and returns it as a PNG `model.scale` times larger. Waits, and pauses,
 * while the machine's battery cannot carry it; see {@link heavyWork}.
 *
 * @throws {UpscaleError} when `REALESRGAN_BINARY` is not set or the upscaler fails.
 */
export const upscale = async (picture: Uint8Array, model: Model): Promise<Uint8Array> => {
	/**
	 * Upscaling runs on a processor when there is no graphics card, which
	 * takes minutes. Counts only the time it runs; see {@link heavyWork}.
	 */
	const timeoutMinutes = 40;

	if (!config.realesrganBinary) {
		throw new UpscaleError("REALESRGAN_BINARY is not set");
	}

	const folder = await mkdtemp(path.join(tmpdir(), "sora-upscale-"));

	try {
		const input = path.join(folder, "in");
		const output = path.join(folder, "out.png");
		await writeFile(input, picture);

		const finished = await heavyWork.run(
			[
				config.realesrganBinary,
				"-i",
				input,
				"-o",
				output,
				"-n",
				model.name,
				"-s",
				String(model.scale),
				"-f",
				"png",
				"-m",
				path.join(path.dirname(config.realesrganBinary), "models"),
			],
			timeoutMinutes * minute,
		);

		if (finished.timedOut) {
			throw new UpscaleError(`Upscaling ran longer than ${timeoutMinutes} minutes`);
		}

		if (finished.code !== 0) {
			throw new UpscaleError(`Upscaling failed: ${finished.stderr.trim().split("\n").at(-1)}`);
		}

		return await readFile(output);
	} finally {
		await rm(folder, {
			force: true,
			recursive: true,
		});
	}
};
