/**
 * A master playlist with one audio rendition per language in `languages`, the
 * first the default, and one variant stream: as MegaPlay serves an episode's
 * sub and dub, or, with none, a stream whose audio comes with its video.
 */
export const master = (languages: readonly string[]) => {
	const renditions = languages.map((language, index) => {
		let preset = "NO";

		if (index === 0) {
			preset = "YES";
		}

		return `#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="aac",NAME="${language}",DEFAULT=${preset},LANGUAGE="${language}",URI="audio/${language}/index.m3u8"`;
	});

	let audio = "";

	if (languages.length > 0) {
		audio = ',AUDIO="aac"';
	}

	return [
		"#EXTM3U",
		...renditions,
		`#EXT-X-STREAM-INF:BANDWIDTH=5500000${audio}`,
		"index-f1.m3u8",
	].join("\n");
};
