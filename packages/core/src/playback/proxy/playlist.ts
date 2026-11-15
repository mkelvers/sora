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

const audioRenditionPattern = /^#EXT-X-MEDIA:(?:.*,)?TYPE=AUDIO(?:,.*)?$/gmu;
const defaultRenditionPattern = /[:,]DEFAULT=YES(?:,|$)/u;
const renditionLanguagePattern = /[:,]LANGUAGE="(?<language>[^"]*)"/u;

/**
 * The language of the audio a player starts an HLS stream with: the master
 * playlist's audio rendition marked `DEFAULT=YES`, else its first, as hls.js
 * picks without an audio preference.
 *
 * @returns The rendition's BCP 47 `LANGUAGE`, or `null` when the playlist
 *   lists no audio renditions, so the audio comes with the video and the
 *   playlist does not say its language, or when the rendition names none.
 */
export const defaultAudioLanguage = (content: string): string | null => {
	const renditions = content.match(audioRenditionPattern) ?? [];
	const started = renditions.find((tag) => defaultRenditionPattern.test(tag)) ?? renditions[0];
	return started ? (renditionLanguagePattern.exec(started)?.groups?.language ?? null) : null;
};
