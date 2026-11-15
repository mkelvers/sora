import { attempt, inSequence, second } from "@sora/shared";

import type { ProviderUnit } from "../episodes/episodes";
import type { ProviderVideo, StreamProvider } from "../providers/provider";
import { servedLocale } from "../providers/registry";
import { readStreamAudioLanguage } from "../proxy/proxy";

/** How long a playlist's host has to answer before the dub counts as unconfirmed. */
const playlistTimeoutMs = 3 * second;

/**
 * Whether a dub's audio is in {@link servedLocale}: some HLS video's playlist
 * starts with audio in it, or does not say which language it starts with, so
 * the provider's word stands. A playlist that cannot be read confirms nothing.
 *
 * A provider can call a stream a dub that plays the original audio. MegaPlay
 * serves one playlist with every audio language for an episode's sub and dub,
 * and until the dub's audio is in it, its dub starts with Japanese.
 */
export const dubAudioServed = async (
	videos: readonly ProviderVideo[],
	readAudioLanguage: typeof readStreamAudioLanguage = readStreamAudioLanguage,
) => {
	const languages = await Promise.all(
		videos.map(async (video) => {
			if (video.format !== "hls") {
				return null;
			}
			const { data, error } = await attempt(
				readAudioLanguage(video.url, video.headers, AbortSignal.timeout(playlistTimeoutMs)),
			);
			return error ? "unreadable" : data;
		}),
	);
	return languages.some(
		(language) => language === null || language.toLowerCase().split("-")[0] === servedLocale,
	);
};

/** Whether `provider` streams an episode's dub with audio in {@link servedLocale}. */
export const streamsDub = async (
	provider: Pick<StreamProvider, "resolveStream">,
	episodeId: string,
) => {
	const { data, error } = await attempt(provider.resolveStream(episodeId, "dub"));
	return !error && (await dubAudioServed(data.videos));
};

/**
 * `units` without the dubs they newly list that `streamsDub` does not
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

	return units.map((unit) =>
		unconfirmed.has(unit.id)
			? {
					...unit,
					languages: unit.languages?.filter((language) => language !== "dub") ?? null,
				}
			: unit,
	);
};
