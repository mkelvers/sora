/**
 * A master playlist with one audio rendition per language in `languages`, the
 * first the default, and one variant stream: as MegaPlay serves an episode's
 * sub and dub, or, with none, a stream whose audio comes with its video.
 */
export const masterPlaylist = (languages: readonly string[]) =>
	[
		"#EXTM3U",
		...languages.map(
			(language, index) =>
				`#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="${language}",DEFAULT=${index === 0 ? "YES" : "NO"},LANGUAGE="${language}",URI="audio/${language}/index.m3u8"`,
		),
		`#EXT-X-STREAM-INF:BANDWIDTH=5500000${languages.length > 0 ? ',AUDIO="aac"' : ""}`,
		"index-f1.m3u8",
	].join("\n");
