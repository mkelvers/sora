import { attempt } from "@sora/shared";

import { getAnime } from "../../catalog/queries/anime";
import { AnimeNotFoundError, UpstreamUnavailableError } from "../../errors";
import { InFlight } from "../../in-flight";
import { scheduleEpisodeLookups } from "../../scheduler/queue";
import { anilistEpisodeKey, type LocatedEpisode } from "../../series/episodes";
import type { ContentLanguage } from "../../series/models";
import type { StreamProvider } from "../providers/provider";
import { servedLocale, streamProviders } from "../providers/registry";
import { getProviderUnits, getStoredUnits, type ProviderUnit, type StoredUnits } from "./episodes";

/**
 * One way to watch an episode: its {@link ContentLanguage} and, for sub and
 * dub, whose language it is in.
 */
export interface EpisodeVersion {
	language: ContentLanguage;
	/**
	 * BCP 47 language of a dub's audio or of a sub's subtitles, such as `en`
	 * for an English dub. `null` for raw, which keeps the original audio and
	 * has no subtitles.
	 */
	locale: string | null;
}

/** An episode as a provider lists it, with the provider that lists it. */
export interface ListedUnit {
	source: Pick<StreamProvider, "locale" | "listsLanguages">;
	unit: ProviderUnit;
}

/** Dub is preferred, then sub, then raw. */
const languageOrder: Record<ContentLanguage, number> = {
	dub: 0,
	sub: 1,
	raw: 2,
};

/**
 * The versions an episode's listings offer: dub before sub before raw, and
 * each by locale.
 *
 * Only providers whose lists say truthfully which languages an episode has
 * count, and a unit that does not say is left out rather than guessed.
 */
export function versionsOffered(listings: readonly ListedUnit[]): EpisodeVersion[] {
	const versions = new Map<string, EpisodeVersion>();
	for (const { source, unit } of listings) {
		if (!source.listsLanguages) {
			continue;
		}

		for (const language of unit.languages ?? []) {
			const version = {
				language,
				locale: language === "raw" ? null : source.locale,
			};
			versions.set(`${version.language}:${version.locale}`, version);
		}
	}

	return [...versions.values()].sort(
		(left, right) =>
			languageOrder[left.language] - languageOrder[right.language] ||
			(left.locale ?? "").localeCompare(right.locale ?? ""),
	);
}

/**
 * The languages among `versions`, in the order {@link versionsOffered} sorts
 * them, without their locales.
 */
export function languagesOf(versions: readonly EpisodeVersion[]): ContentLanguage[] {
	return [...new Set(versions.map((version) => version.language))];
}

/**
 * Lists the versions of one AniList episode that providers offer, for
 * playing it.
 *
 * Reads the providers' stored episode lists. Someone is waiting to watch
 * the episode, so an anime no provider has been looked up for yet is looked
 * up on the spot, once; after that the scheduler keeps its lists current.
 */
export async function getEpisodeVersions(
	episode: Pick<LocatedEpisode, "anilistId" | "number">,
): Promise<EpisodeVersion[]> {
	const listed = (
		await readAnimeListings([episode.anilistId], {
			lookUpUnknown: true,
		})
	).get(episode.anilistId);
	return versionsOffered(
		listed?.listings.filter(({ unit }) => unit.number === episode.number) ?? [],
	);
}

/**
 * Whether the providers listing an episode call it filler: `true` if any
 * does, `false` if those that say all say not, and `null` when none says.
 */
export function fillerOf(listings: readonly ListedUnit[]): boolean | null {
	const flags = listings.flatMap(({ unit }) => (unit.isFiller === null ? [] : [unit.isFiller]));
	return flags.length === 0 ? null : flags.includes(true);
}

/** What the providers say about one AniList episode. */
export interface EpisodeListing {
	/** See {@link languagesOf}; `null` while the episode is not known yet. */
	languages: ContentLanguage[] | null;
	/** See {@link fillerOf}; also `null` while the episode is not known yet. */
	isFiller: boolean | null;
}

/**
 * Lists the languages each AniList episode can be watched in, and whether it
 * is filler, from the providers' stored episode lists.
 *
 * Reads only the database, so listing episodes never waits on a provider.
 * An anime no provider has been looked up for yet is queued for the
 * scheduler, and its episodes are unknown until it has run. So is an episode
 * none of the looked-up providers offers while others are not looked up yet:
 * it is unknown rather than unwatchable.
 *
 * @returns Listings keyed by {@link anilistEpisodeKey}, with `null` fields
 *   for an episode that is not known yet.
 */
export async function findEpisodeListings(
	episodes: readonly {
		anilistId: number;
		episode: number;
	}[],
): Promise<Map<string, EpisodeListing>> {
	const listingsById = await readAnimeListings(
		episodes.map((episode) => episode.anilistId),
		{
			lookUpUnknown: false,
		},
	);

	const found = new Map<string, EpisodeListing>();
	for (const { anilistId, episode } of episodes) {
		const listed = listingsById.get(anilistId);
		const listings = listed ? listed.listings.filter(({ unit }) => unit.number === episode) : [];
		const versions = versionsOffered(listings);
		const isKnown = !!listed && !(versions.length === 0 && listed.pending);
		found.set(anilistEpisodeKey(anilistId, episode), {
			languages: isKnown ? languagesOf(versions) : null,
			isFiller: isKnown ? fillerOf(listings) : null,
		});
	}

	return found;
}

/**
 * The languages any episode of each anime can be watched in, dub before sub
 * before raw, from the providers' stored episode lists.
 *
 * Reads only the database. An anime some provider has not been looked up
 * for yet is queued for the scheduler ahead of its backfill, since its card
 * is being shown; until then it has only the languages already looked up.
 */
export async function findAnimeLanguages(
	anilistIds: readonly number[],
): Promise<Map<number, ContentLanguage[]>> {
	const sources = listingSources();
	const ids = [...new Set(anilistIds)];
	const stored = await getStoredUnits(ids);
	const listed = ids.map((anilistId) => ({
		anilistId,
		...listingsOf(anilistId, stored, sources),
	}));
	await scheduleEpisodeLookups(
		listed.filter(({ pending }) => pending).map(({ anilistId }) => anilistId),
		"current",
	);
	return new Map(
		listed.map(({ anilistId, listings }) => [anilistId, languagesOf(versionsOffered(listings))]),
	);
}

/** Episode lists stored for one anime. */
interface AnimeListings {
	listings: ListedUnit[];
	/** Whether some provider that lists languages has not been looked up yet. */
	pending: boolean;
}

/**
 * The episode lists of each anime from the providers that list languages
 * truthfully.
 *
 * With `lookUpUnknown`, an anime no provider has been looked up for yet is
 * looked up on the spot, once; its lists are stored, and later calls only
 * read them. Every provider still missing, such as one that failed, is left
 * to the scheduler, whose lookup is queued to run first.
 */
async function readAnimeListings(
	anilistIds: readonly number[],
	options: {
		lookUpUnknown: boolean;
	},
): Promise<Map<number, AnimeListings>> {
	const sources = listingSources();
	const ids = [...new Set(anilistIds)];
	const stored = await getStoredUnits(ids);
	if (options.lookUpUnknown) {
		const neverLookedUp = ids.filter(
			(anilistId) => !stored.some((entry) => entry.anilistId === anilistId),
		);
		for (const found of await Promise.all(
			neverLookedUp.map((anilistId) => lookUpNow(anilistId, sources)),
		)) {
			stored.push(...found);
		}
	}

	const byId = new Map(ids.map((anilistId) => [anilistId, listingsOf(anilistId, stored, sources)]));

	await scheduleEpisodeLookups(
		[...byId].flatMap(([anilistId, listed]) => (listed.pending ? [anilistId] : [])),
		"waiting",
	);
	return byId;
}

/** The providers whose lists say truthfully which languages the served locale has. */
function listingSources() {
	return streamProviders.filter(
		(source) => source.listsLanguages && source.locale === servedLocale,
	);
}

/** One anime's episode lists among `stored`, from `sources`. */
function listingsOf(
	anilistId: number,
	stored: readonly StoredUnits[],
	sources: readonly StreamProvider[],
): AnimeListings {
	const found = sources.map((source) => ({
		source,
		units: stored.find((entry) => entry.anilistId === anilistId && entry.provider === source.id)
			?.units,
	}));
	return {
		listings: found.flatMap(({ source, units }) =>
			(units ?? []).map((unit) => ({
				source,
				unit,
			})),
		),
		pending: found.some(({ units }) => units === undefined),
	};
}

/**
 * First lookups in flight, keyed by AniList ID, so listings made while one
 * is running wait on it instead of starting another.
 */
const lookupsInFlight = new InFlight<number, StoredUnits[]>();

/**
 * Looks an anime up on `sources` at once and stores their lists. Leaves out
 * the providers that fail, and every provider when the anime cannot be
 * loaded.
 */
function lookUpNow(anilistId: number, sources: readonly StreamProvider[]): Promise<StoredUnits[]> {
	return lookupsInFlight.run(anilistId, async () => {
		const { data: anime, error } = await attempt(
			getAnime(anilistId),
			AnimeNotFoundError,
			UpstreamUnavailableError,
		);
		if (error) {
			return [];
		}

		const found = await Promise.all(
			sources.map(async (provider) => {
				const { data: units, error } = await attempt(getProviderUnits(anime, provider));
				if (error) {
					console.warn(
						`${provider.id} could not list the episodes of anime ${anilistId}: ${error.message}`,
					);
					return [];
				}
				return [
					{
						anilistId,
						provider: provider.id,
						units,
					},
				];
			}),
		);
		return found.flat();
	});
}
