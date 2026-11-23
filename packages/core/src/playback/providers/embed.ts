import { createDecipheriv } from "node:crypto";

import type { HttpClient } from "anime-sdk";
import { z } from "zod";

import type { SkipSegment } from "../../models/playback";
import type { ContentLanguage } from "../../models/series";
import { Label } from "./label";
import type { ProviderStream } from "./provider";

/** A MegaPlay embed page for one episode and language. */
export class Embed {
	/**
	 * MegaPlay's player script encrypts the source URL into an `enc` field with
	 * this fixed AES-256-CBC key and IV. `anime-sdk` only reads the unencrypted
	 * `sources.file` field, which MegaPlay no longer sends, so AniKoto and MegaPlay
	 * playback goes through this module instead.
	 */
	static readonly #key = Buffer.concat([Buffer.from("i?LMTAx0Q6,:}50U"), Buffer.alloc(16)]);

	static readonly #iv = Buffer.from([
		87, 48, 59, 50, 55, 84, 111, 97, 85, 112, 108, 95, 80, 37, 39, 99,
	]);

	/**
	 * A skippable span MegaPlay reports, in seconds. MegaPlay sends `0`–`0` when
	 * it knows nothing, so an empty span means no segment.
	 */
	static readonly #SkipSpan = z.object({
		end: z.number().nonnegative(),
		start: z.number().nonnegative(),
	});

	static readonly #Sources = z
		.object({
			enc: z.string().min(1).optional(),
			// Skip spans only enhance playback, so a malformed one is dropped rather
			// than failing the stream.
			intro: Embed.#SkipSpan.optional().catch(undefined),
			outro: Embed.#SkipSpan.optional().catch(undefined),
			sources: z
				.object({
					file: z.string().min(1),
				})
				.optional(),
			tracks: z
				.array(
					z.object({
						file: z.string().min(1),
						kind: z.string().optional(),
						label: z.string().optional(),
					}),
				)
				.optional(),
		})
		.refine((body) => body.sources !== undefined || body.enc !== undefined, {
			message: "MegaPlay returned neither sources nor enc",
		});

	static readonly #EncryptedSource = z.object({
		file: z.string().min(1),
	});

	readonly #http: HttpClient;
	readonly #url: string;
	readonly #referer: string;
	readonly #language: ContentLanguage;

	/**
	 * @param url - The `megaplay.buzz/stream/...` embed for one episode and language.
	 * @param referer - The page that embeds the player; MegaPlay checks it.
	 */
	constructor(http: HttpClient, url: string, referer: string, language: ContentLanguage) {
		this.#http = http;
		this.#url = url;
		this.#referer = referer;
		this.#language = language;
	}

	/**
	 * The embed's stream, with the opening and ending MegaPlay's player ships
	 * with it.
	 *
	 * @throws {Error} when the embed or its sources cannot be read.
	 */
	async stream(): Promise<ProviderStream> {
		/** MegaPlay's CDNs reject media requests without this referer. */
		const mediaReferer = "https://megaplay.buzz/";

		const body = await this.#sources();

		let file = body.sources?.file ?? null;

		// Node's base64 decoder accepts both the standard and URL-safe alphabets
		// MegaPlay mixes in `enc`.
		if (!file && body.enc) {
			const decipher = createDecipheriv("aes-256-cbc", Embed.#key, Embed.#iv);

			const plain = Buffer.concat([
				decipher.update(Buffer.from(body.enc, "base64")),
				decipher.final(),
			]).toString("utf-8");

			({ file } = Embed.#EncryptedSource.parse(JSON.parse(plain)));
		}

		if (!file) {
			throw new Error("MegaPlay returned no source URL");
		}

		// MegaPlay sends `0`–`0` for a span it does not know, and one that ends
		// before it starts is as useless.
		const { intro, outro } = body;
		const segments: SkipSegment[] = [];

		if (intro && intro.end > intro.start) {
			segments.push({
				kind: "opening",
				...intro,
			});
		}

		if (outro && outro.end > outro.start) {
			segments.push({
				kind: "ending",
				...outro,
			});
		}

		let format: "hls" | "mp4" = "mp4";

		if (new URL(file).pathname.endsWith(".m3u8")) {
			format = "hls";
		}

		return {
			// A cold open can put the opening after an early ending card.
			skipSegments: segments.toSorted((left, right) => left.start - right.start),
			videos: [
				{
					format,
					headers: {
						Referer: mediaReferer,
					},
					quality: "auto",
					subtitles: (body.tracks ?? []).flatMap((track) => {
						if (track.kind !== "captions" || !track.label) {
							return [];
						}

						let trackFormat: "vtt" | "srt" = "srt";

						if (track.file.endsWith(".vtt")) {
							trackFormat = "vtt";
						}

						return [
							{
								format: trackFormat,
								label: track.label,
								language: new Label(track.label).language,
								url: track.file,
							},
						];
					}),
					url: file,
				},
			],
		};
	}

	/**
	 * The `getSources` payload behind the embed page.
	 *
	 * @throws {Error} when the embed or its sources cannot be read.
	 */
	async #sources() {
		const pageResponse = await this.#http.get(this.#url, {
			headers: {
				Referer: this.#referer,
			},
		});

		const page = await pageResponse.text();

		if (page.includes("<title>Error - MegaPlay</title>")) {
			throw new Error(`MegaPlay has no ${this.#language} source for this episode`);
		}

		const fileId =
			/<title>\s*File\s+(?<id>\d+)\s*-/iu.exec(page)?.[1] ??
			/data-id="(?<id>\d+)"/u.exec(page)?.[1];

		if (!fileId) {
			throw new Error("MegaPlay embed page has no file ID");
		}

		const sourcesUrl = new URL("/stream/getSources", this.#url);
		sourcesUrl.searchParams.set("id", fileId);

		const response = await this.#http.get(sourcesUrl.toString(), {
			headers: {
				Referer: this.#url,
				"X-Requested-With": "XMLHttpRequest",
			},
		});

		return Embed.#Sources.parse(await response.json());
	}
}
