import { attempt, inSequence, second } from "@sora/shared";

import type { ProviderUnit } from "../episodes/episodes";
import type { ProviderVideo, StreamProvider } from "../providers/provider";
import { servedLocale } from "../providers/registry";
import { audioLanguages, isInLocale } from "../proxy/playlist";
import { canFetchStream, readPlaylist } from "../proxy/proxy";
import type { PlaylistReader } from "../proxy/proxy";
import { StreamUpstreamError } from "../proxy/upstream-error";

/**
 * What {@link probeVideos} found of one video; `null` when no host serves it.
 * `audioLanguages` is `null` when the host answered 429: it is up and
 * throttling a burst, which requests for the stream wait out, but its playlist
 * was not read.
 */
export type VideoProbe = {
	/** See {@link audioLanguages}; empty for a video that is not HLS. */
	audioLanguages: string[] | null;
} | null;

/** How {@link probeVideos} reaches hosts; tests pass their own. */
export interface ProbeDependencies {
	readPlaylist: PlaylistReader;
	canFetchStream: typeof canFetchStream;
}

/**
 * Probes each of a provider's videos with one request: an HLS video by reading
 * its master playlist, which lists its audio languages, any other by its
 * headers, which say nothing of its audio.
 *
 * A host that accepts connections and never answers would otherwise fail
 * every play with a gateway timeout while the next provider sat unused.
 */
export const probeVideos = (
	videos: readonly ProviderVideo[],
	dependencies?: ProbeDependencies,
): Promise<VideoProbe[]> => {
	/** How long a video's host has to answer before its provider is passed over. */
	const timeoutMs = 3 * second;

	const hosts = dependencies ?? {
		canFetchStream,
		readPlaylist,
	};

	return Promise.all(
		videos.map(async (video) => {
			const signal = AbortSignal.timeout(timeoutMs);

			if (video.format === "hls") {
				const { data, error } = await attempt(
					hosts.readPlaylist(video.url, video.headers, {
						signal,
					}),
					StreamUpstreamError,
				);

				if (!error) {
					return {
						audioLanguages: audioLanguages(data.content),
					};
				}

				if (error.status !== 429) {
					return null;
				}

				return {
					audioLanguages: null,
				};
			}

			const loads = await hosts.canFetchStream(video.url, video.headers, [], signal);

			if (loads) {
				return {
					audioLanguages: [],
				};
			}

			return null;
		}),
	);
};

/**
 * Whether a dub's videos have audio in {@link servedLocale}: one lists it, or
 * lists no audio languages, so the provider's word stands. A throttled host,
 * whose playlist was not read, confirms nothing.
 *
 * A provider can call a stream a dub that has only the original audio.
 * MegaPlay serves one playlist with every audio language for an episode's sub
 * and dub, and until the dub's audio is in it, it has none in English.
 */
export const hasDubAudio = (probes: readonly VideoProbe[]) =>
	probes.some(
		(probe) =>
			!!probe?.audioLanguages &&
			(probe.audioLanguages.length === 0 ||
				probe.audioLanguages.some((language) => isInLocale(language, servedLocale))),
	);

/** Whether `provider` streams an episode's dub with audio in {@link servedLocale}. */
export const servesDub = async (
	provider: Pick<StreamProvider, "resolveStream">,
	episodeId: string,
) => {
	const { data, error } = await attempt(provider.resolveStream(episodeId, "dub"));

	return !error && hasDubAudio(await probeVideos(data.videos));
};

/**
 * `units` without the dubs they newly list that `servesDub` does not
 * confirm, so an episode is never labelled dubbed before its dub plays.
 *
 * A dub is new when `previous`, the list stored before, did not have it.
 * Providers list a dub before its audio is out: AniKoto listed Overgeared
 * episode 8's dub while MegaPlay still played Japanese for it. A dub left out
 * is new again on the next refresh, which checks it again. With no list stored
 * before, every dub stands on the provider's word, since checking them all
 * would cost a stream lookup per episode.
 */
export const withConfirmedDubs = async (
	units: readonly ProviderUnit[],
	previous: readonly ProviderUnit[] | null,
	confirm: (unit: ProviderUnit) => Promise<boolean>,
): Promise<ProviderUnit[]> => {
	if (!previous) {
		return [...units];
	}

	const dubbedBefore = new Set(
		previous.filter((unit) => unit.languages?.includes("dub")).map((unit) => unit.number),
	);

	const unconfirmed = new Set<string>();
	await inSequence(
		units.filter((unit) => unit.languages?.includes("dub") && !dubbedBefore.has(unit.number)),
		async (unit) => {
			if (!(await confirm(unit))) {
				unconfirmed.add(unit.id);
			}
		},
	);

	return units.map((unit) => {
		if (unconfirmed.has(unit.id)) {
			return {
				...unit,
				languages: unit.languages?.filter((language) => language !== "dub") ?? null,
			};
		}

		return unit;
	});
};
