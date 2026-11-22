import type { StreamTargetKind } from "./token";

/** Produces the replacement URI for one upstream resource referenced by a playlist. */
export type PlaylistUriSigner = (url: string, kind: StreamTargetKind) => string;

const tagUriKind = (tag: string): StreamTargetKind | null => {
	if (tag.startsWith("#EXT-X-MEDIA:") || tag.startsWith("#EXT-X-I-FRAME-STREAM-INF:")) {
		return "playlist";
	}

	if (tag.startsWith("#EXT-X-MAP:")) {
		return "segment";
	}

	if (tag.startsWith("#EXT-X-KEY:") || tag.startsWith("#EXT-X-SESSION-KEY:")) {
		return "key";
	}

	return null;
};

/**
 * Rewrites every URI in an HLS playlist through `sign`.
 *
 * Relative URIs are resolved against `playlistUrl` first. In a master
 * playlist, variant streams and renditions are marked `playlist`; in a media
 * playlist, segments and `EXT-X-MAP` sections are marked `segment` and
 * `EXT-X-KEY` URIs are marked `key`. Comments, tags, and blank lines are
 * preserved.
 *
 * @example
 * ```ts
 * rewritePlaylist(text, "https://cdn.example/show/index.m3u8", (url, kind) => sign(url, kind));
 * ```
 */
export const rewritePlaylist = (content: string, playlistUrl: string, sign: PlaylistUriSigner) => {
	const isMaster = /^#EXT-X-(?:STREAM-INF|MEDIA|I-FRAME-STREAM-INF):/mu.test(content);
	const lineKind: StreamTargetKind = isMaster ? "playlist" : "segment";
	const resolve = (uri: string) => new URL(uri, playlistUrl).toString();

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

			const kind = tagUriKind(trimmed);

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

const audioRenditionPattern = /^#EXT-X-MEDIA:(?:.*,)?TYPE=AUDIO(?:,.*)?$/u;
const renditionLanguagePattern = /[:,]LANGUAGE="(?<language>[^"]*)"/u;
const renditionGroupPattern = /[:,]GROUP-ID="(?<group>[^"]*)"/u;
const defaultAttributePattern = /(?<lead>[:,])DEFAULT=[^,]*/u;
const autoselectAttributePattern = /(?<lead>[:,])AUTOSELECT=[^,]*/u;

/** Whether a BCP 47 tag, such as `en-US`, is in `locale`'s language. */
export const isInLocale = (tag: string, locale: string) =>
	tag.trim().toLowerCase().split("-")[0] === locale.toLowerCase();

/** A rendition's `GROUP-ID`; empty when it names none. */
const groupOf = (tag: string) => renditionGroupPattern.exec(tag)?.groups?.group ?? "";

/** `tag` with the attribute `pattern` matches set to `value`, added when missing. */
const withAttribute = (tag: string, pattern: RegExp, name: string, value: string) =>
	pattern.test(tag) ? tag.replace(pattern, `$<lead>${name}=${value}`) : `${tag},${name}=${value}`;

/**
 * The `LANGUAGE` of each audio rendition a master playlist lists, in order.
 * Empty when it lists none, so the audio comes with the video and the
 * playlist does not say its language.
 */
export const audioLanguages = (content: string) =>
	content.split(/\r?\n/u).flatMap((line) => {
		const tag = line.trim();

		if (!audioRenditionPattern.test(tag)) {
			return [];
		}

		return [renditionLanguagePattern.exec(tag)?.groups?.language ?? ""];
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
		const tag = line.trim();
		const language = renditionLanguagePattern.exec(tag)?.groups?.language;

		if (
			audioRenditionPattern.test(tag) &&
			language &&
			isInLocale(language, locale) &&
			!chosen.has(groupOf(tag))
		) {
			chosen.set(groupOf(tag), index);
		}
	}

	return lines
		.map((line, index) => {
			const tag = line.trim();

			if (!audioRenditionPattern.test(tag) || !chosen.has(groupOf(tag))) {
				return line;
			}

			const value = chosen.get(groupOf(tag)) === index ? "YES" : "NO";

			return withAttribute(
				withAttribute(tag, defaultAttributePattern, "DEFAULT", value),
				autoselectAttributePattern,
				"AUTOSELECT",
				value,
			);
		})
		.join("\n");
};
