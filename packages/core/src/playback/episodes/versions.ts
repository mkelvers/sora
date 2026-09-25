import { getAnime } from "../../catalog/queries/anime";
import { scheduleEpisodeLookup } from "../../scheduler/queue";
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
  raw: 2
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
        locale: language === "raw" ? null : source.locale
      };
      versions.set(`${version.language}:${version.locale}`, version);
    }
  }

  return [...versions.values()].sort(
    (left, right) =>
      languageOrder[left.language] - languageOrder[right.language] ||
      (left.locale ?? "").localeCompare(right.locale ?? "")
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
 * Lists the versions of one AniList episode that providers offer.
 *
 * Reads the providers' stored episode lists. Only an anime no provider has
 * been looked up for yet is looked up on the spot, once; after that the
 * scheduler keeps its lists current.
 */
export async function getEpisodeVersions(episode: Pick<LocatedEpisode, "anilistId" | "anilistEpisode">): Promise<EpisodeVersion[]> {
  const listed = (await readAnimeListings([episode.anilistId])).get(episode.anilistId);
  return versionsOffered(listed?.listings.filter(({ unit }) => unit.number === episode.anilistEpisode) ?? []);
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
 * is filler, from the providers' stored episode lists. Only an anime no
 * provider has been looked up for yet is looked up on the spot, once.
 *
 * An episode none of the looked-up providers offers while others are not
 * looked up yet is unknown rather than unwatchable; the scheduler looks
 * those up.
 *
 * @returns Listings keyed by {@link anilistEpisodeKey}, with `null` fields
 *   for an episode that is not known yet.
 */
export async function findEpisodeListings(
  episodes: readonly {
    anilistId: number;
    episode: number;
  }[]
): Promise<Map<string, EpisodeListing>> {
  const listingsById = await readAnimeListings(episodes.map((episode) => episode.anilistId));

  const found = new Map<string, EpisodeListing>();
  for (const { anilistId, episode } of episodes) {
    const listed = listingsById.get(anilistId);
    const listings = listed ? listed.listings.filter(({ unit }) => unit.number === episode) : [];
    const versions = versionsOffered(listings);
    const isKnown = !!listed && !(versions.length === 0 && listed.pending);
    found.set(anilistEpisodeKey(anilistId, episode), {
      languages: isKnown ? languagesOf(versions) : null,
      isFiller: isKnown ? fillerOf(listings) : null
    });
  }

  return found;
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
 * An anime no provider has been looked up for yet is looked up on the spot,
 * once; its lists are stored, and later calls only read them. A provider
 * missing after that, such as one that failed, is left to the scheduler,
 * whose lookup is queued to run first.
 */
async function readAnimeListings(anilistIds: readonly number[]): Promise<Map<number, AnimeListings>> {
  const sources = streamProviders.filter((source) => source.listsLanguages && source.locale === servedLocale);
  const ids = [...new Set(anilistIds)];
  const stored = await getStoredUnits(ids);
  const neverLookedUp = ids.filter((anilistId) => !stored.some((entry) => entry.anilistId === anilistId));
  for (const found of await Promise.all(neverLookedUp.map((anilistId) => lookUpNow(anilistId, sources)))) {
    stored.push(...found);
  }

  const byId = new Map<number, AnimeListings>();
  for (const anilistId of ids) {
    const found = sources.map((source) => ({
      source,
      units: stored.find((entry) => entry.anilistId === anilistId && entry.provider === source.id)?.units
    }));
    const pending = found.some(({ units }) => units === undefined);
    if (pending) {
      await scheduleEpisodeLookup(anilistId, "current");
    }

    byId.set(anilistId, {
      listings: found.flatMap(({ source, units }) =>
        (units ?? []).map((unit) => ({
          source,
          unit
        }))
      ),
      pending
    });
  }

  return byId;
}

/**
 * First lookups in flight, keyed by AniList ID, so listings made while one
 * is running wait on it instead of starting another.
 */
const lookupsInFlight = new Map<number, Promise<StoredUnits[]>>();

/**
 * Looks an anime up on `sources` at once and stores their lists. Leaves out
 * the providers that fail, and every provider when the anime cannot be
 * loaded.
 */
function lookUpNow(anilistId: number, sources: readonly StreamProvider[]): Promise<StoredUnits[]> {
  const running = lookupsInFlight.get(anilistId);
  if (running) {
    return running;
  }

  const lookup = (async () => {
    const anime = await getAnime(anilistId).catch(() => null);
    if (!anime) {
      return [];
    }

    const found = await Promise.all(
      sources.map((provider) =>
        getProviderUnits(anime, provider).then(
          (units) => [
            {
              anilistId,
              provider: provider.id,
              units
            }
          ],
          () => []
        )
      )
    );
    return found.flat();
  })().finally(() => lookupsInFlight.delete(anilistId));
  lookupsInFlight.set(anilistId, lookup);
  return lookup;
}
