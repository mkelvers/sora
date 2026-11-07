/** Produces the replacement URI for one preview image referenced by a thumbnails file. */
export type SpriteUriSigner = (url: string) => string;

/**
 * A cue payload that names an image: a region of a sprite sheet
 * (`sprite.webp#xywh=160,0,160,90`) or a whole image of its own (`0001.jpg`).
 */
const imageLine = /^(?<uri>[^\s#]+)(?<region>#xywh=\d+,\d+,\d+,\d+)?$/u;

/**
 * Rewrites the image of every cue in a WebVTT thumbnails file through `sign`,
 * keeping a sprite cue's `#xywh` region. Relative URIs are resolved against
 * `fileUrl` first. An image is signed once however many cues use it, so cues
 * on one sprite sheet share one URL, which a browser loads and caches once.
 * Timings, cue identifiers, notes and any payload that is not an image are
 * kept as they are.
 *
 * @example
 * ```ts
 * rewriteThumbnails(text, "https://cdn.example/preview/thumbnails.vtt", (url) => sign(url));
 * ```
 */
export const rewriteThumbnails = (content: string, fileUrl: string, sign: SpriteUriSigner) => {
	let payload = false;
	const signed = new Map<string, string>();

	return content
		.split(/\r?\n/u)
		.map((line) => {
			const trimmed = line.trim();
			if (trimmed.includes("-->")) {
				payload = true;
				return line;
			}

			const isPayload = payload && trimmed !== "";
			payload = false;
			if (!isPayload) {
				return line;
			}

			const { uri, region = "" } = imageLine.exec(trimmed)?.groups ?? {};
			if (!uri || !URL.canParse(uri, fileUrl)) {
				return line;
			}

			const url = new URL(uri, fileUrl).toString();
			const token = signed.get(url) ?? sign(url);
			signed.set(url, token);
			return `${token}${region}`;
		})
		.join("\n");
};
