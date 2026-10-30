import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { config } from "../config";

/** The model that upscales: trained on anime and drawn art, which backdrops are. */
const model = "realesr-animevideov3";

/** How many times larger the picture gets. */
export const upscaleFactor = 2;

/** Upscaling runs on a processor when there is no graphics card, which takes minutes. */
const timeoutMs = 20 * 60_000;

/** Upscaling failed: the upscaler is not set up, or it exited with an error. */
export class UpscaleError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "UpscaleError";
	}
}

/**
 * Upscales a picture with `realesrgan-ncnn-vulkan` and returns it as a PNG.
 *
 * @throws {UpscaleError} when `REALESRGAN_BINARY` is not set or the upscaler fails.
 */
export const upscale = async (picture: Uint8Array): Promise<Uint8Array> => {
	if (!config.realesrganBinary) {
		throw new UpscaleError("REALESRGAN_BINARY is not set");
	}

	const folder = await mkdtemp(path.join(tmpdir(), "sora-upscale-"));
	try {
		const input = path.join(folder, "in");
		const output = path.join(folder, "out.png");
		await writeFile(input, picture);

		const child = Bun.spawn(
			[
				config.realesrganBinary,
				"-i",
				input,
				"-o",
				output,
				"-n",
				model,
				"-s",
				String(upscaleFactor),
				"-f",
				"png",
				"-m",
				path.join(path.dirname(config.realesrganBinary), "models"),
			],
			{
				stderr: "pipe",
				stdout: "ignore",
				timeout: timeoutMs,
			},
		);
		const [failure, code] = await Promise.all([new Response(child.stderr).text(), child.exited]);
		if (code !== 0) {
			throw new UpscaleError(`Upscaling failed: ${failure.trim().split("\n").at(-1)}`);
		}

		return await readFile(output);
	} finally {
		await rm(folder, {
			force: true,
			recursive: true,
		});
	}
};
