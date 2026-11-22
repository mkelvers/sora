import { Tag } from "./tag";
import type { StreamTargetKind } from "./token";

/** Produces the replacement URI for one upstream resource referenced by a playlist. */
export type PlaylistUriSigner = (url: string, kind: StreamTargetKind) => string;

/**
 * Rewrites every URI in an HLS playlist through `sign`.
 *
 * Relative URIs are resolved against `url` first. In a master
 * playlist, variant streams and renditions are marked `playlist`; in a media
 * playlist, segments and `EXT-X-MAP` sections are marked `segment` and
 * `EXT-X-KEY` URIs are marked `key`. Comments, tags, and blank lines are
 * preserved.
 *
 * @example
 * ```ts
 * rewrite(text, "https://cdn.example/show/index.m3u8", (url, kind) => sign(url, kind));
 * ```
 */
export const rewrite = (content: string, url: string, sign: PlaylistUriSigner) => {
	const isMaster = /^#EXT-X-(?:STREAM-INF|MEDIA|I-FRAME-STREAM-INF):/mu.test(content);
	let lineKind: StreamTargetKind = "segment";

	if (isMaster) {
		lineKind = "playlist";
	}

	const resolve = (uri: string) => new URL(uri, url).toString();

	return content
		.split(/\r?\n/u)
		.map((line) => {
			const trimmed = line.trim();

			if (!trimmed) {
				return line;
			}

			if (!trimmed.startsWith("#")) {
				return sign(resolve(trimmed), lineKind);
			}

			const kind = new Tag(trimmed).uriKind;

			if (!kind) {
				return line;
			}

			return line.replace(
				/URI="(?<uri>[^"]+)"/u,
				(_match, uri: string) => `URI="${sign(resolve(uri), kind)}"`,
			);
		})
		.join("\n");
};

/** Whether a BCP 47 tag, such as `en-US`, is in `locale`'s language. */
export const isInLocale = (tag: string, locale: string) =>
	tag.trim().toLowerCase().split("-")[0] === locale.toLowerCase();

/**
 * The `LANGUAGE` of each audio rendition a master playlist lists, in order.
 * Empty when it lists none, so the audio comes with the video and the
 * playlist does not say its language.
 */
export const audioLanguages = (content: string) =>
	content.split(/\r?\n/u).flatMap((line) => {
		const tag = new Tag(line.trim());

		if (!tag.audio) {
			return [];
		}

		return [tag.language ?? ""];
	});

/**
 * `content` with the first audio rendition in `locale` of each rendition
 * group marked as the one players start with (`DEFAULT` and `AUTOSELECT`),
 * and the group's others not. A group with none in `locale` is left as it is.
 *
 * MegaPlay serves one master playlist for an episode's sub and dub, with
 * every audio language as a rendition and Japanese the default; a dub is
 * this playlist with English made the default.
 */
export const withDefaultAudio = (content: string, locale: string) => {
	const lines = content.split(/\r?\n/u);
	const chosen = new Map<string, number>();

	for (const [index, line] of lines.entries()) {
		const tag = new Tag(line.trim());
		const { language } = tag;

		const wanted = tag.audio && language && isInLocale(language, locale) && !chosen.has(tag.group);

		if (wanted) {
			chosen.set(tag.group, index);
		}
	}

	return lines
		.map((line, index) => {
			const tag = new Tag(line.trim());

			if (!tag.audio || !chosen.has(tag.group)) {
				return line;
			}

			let value = "NO";

			if (chosen.get(tag.group) === index) {
				value = "YES";
			}

			return tag.marked(value);
		})
		.join("\n");
};
