import { attempt, second } from "@sora/shared";

import { sampleRate } from "./spectrum";

/** Audio in any format ffmpeg reads, arriving in chunks. */
export class Samples {
	readonly #chunks: AsyncIterable<Uint8Array>;

	constructor(chunks: AsyncIterable<Uint8Array>) {
		this.#chunks = chunks;
	}

	/**
	 * The audio decoded to mono 16-bit samples at the fingerprint's sample
	 * rate, read as the chunks arrive.
	 *
	 * @throws {Error} when ffmpeg fails.
	 */
	async read() {
		/** How long ffmpeg may take to decode one stretch of audio. */
		const decodeTimeoutMs = 5 * 60 * second;

		const ffmpeg = Bun.spawn(
			[
				"ffmpeg",
				"-loglevel",
				"error",
				"-i",
				"pipe:0",
				"-vn",
				"-ac",
				"1",
				"-ar",
				String(sampleRate),
				"-f",
				"s16le",
				"pipe:1",
			],
			{
				stderr: "pipe",
				stdin: "pipe",
				stdout: "pipe",
				timeout: decodeTimeoutMs,
			},
		);

		const output = new Response(ffmpeg.stdout).arrayBuffer();
		const failure = new Response(ffmpeg.stderr).text();

		const written = await attempt(
			(async () => {
				for await (const chunk of this.#chunks) {
					ffmpeg.stdin.write(chunk);
					await ffmpeg.stdin.flush();
				}

				await ffmpeg.stdin.end();
			})(),
		);

		if (written.error) {
			ffmpeg.kill();
			throw new Error(`Could not read audio: ${written.error.message}`, {
				cause: written.error,
			});
		}

		if ((await ffmpeg.exited) !== 0) {
			throw new Error(`ffmpeg failed: ${await failure}`);
		}

		return new Int16Array(await output);
	}
}
