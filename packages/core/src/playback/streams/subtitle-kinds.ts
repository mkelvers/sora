import type { ProviderVideo } from "../providers/provider";
import { readSubtitle } from "../proxy/proxy";
import { mirrorsFor } from "../proxy/upstream";
import { subtitleKind, type SubtitleKind } from "./subtitle-kind";

/** Kinds already worked out, by the provider's subtitle URL, oldest dropped first. */
const known = new Map<string, SubtitleKind | null>();
const knownLimit = 5_000;

/**
 * What each subtitle track of some videos carries, by the provider's URL.
 *
 * Tracks are read once and remembered. One that cannot be read is judged by
 * its name alone and tried again next time, so an outage never fixes a
 * guess in place.
 */
export async function subtitleKinds(videos: ProviderVideo[]) {
	const kinds = new Map<string, SubtitleKind | null>();
	const tracks = new Map<string, { label: string; format: string | null; video: ProviderVideo }>();
	for (const video of videos) {
		for (const track of video.subtitles) {
			tracks.set(track.url, {
				label: track.label,
				format: track.format,
				video,
			});
		}
	}

	await Promise.all(
		[...tracks].map(async ([url, { label, format, video }]) => {
			if (known.has(url)) {
				kinds.set(url, known.get(url) ?? null);
				return;
			}

			const content =
				format === "vtt"
					? await readSubtitle(url, video.headers, mirrorsFor(url, video.url))
					: null;
			const kind = subtitleKind(label, content);
			kinds.set(url, kind);

			if (content === null && format === "vtt") {
				return;
			}
			known.set(url, kind);
			for (const oldest of known.keys()) {
				if (known.size <= knownLimit) {
					break;
				}
				known.delete(oldest);
			}
		}),
	);

	return kinds;
}
