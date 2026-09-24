import type { BaseProvider, ContentLanguage } from "anime-sdk";

import type { Anime } from "../../catalog/models/anime";
import { getAnime } from "../../catalog/queries/anime";
import { anilistEpisodeKey, locateEpisode } from "../../series/episodes";
import { second } from "../../time";
import { streamProviders, type StreamProvider } from "../providers/registry";
import { getProviderUnits, type ProviderUnit } from "./episodes";

/**
 * One way to watch an episode: its {@link ContentLanguage} and, for sub and
 * dub, whose language it is in. Pass both to `resolvePlayback` to play it.
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

const languageOrder: Record<ContentLanguage, number> = {
  sub: 0,
  dub: 1,
  raw: 2
};

/**
 * The versions an episode's listings offer: sub before dub before raw, and
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
 * How long listing one episode's versions may wait on providers. A provider
 * that has not answered by then is left out, but keeps being looked up.
 */
const episodeVersionsBudgetMs = 10 * second;

/**
 * Lists the versions of one episode that providers offer.
 *
 * Every provider that lists languages truthfully is asked at once. An anime
 * no one has looked up yet takes a few seconds while providers are matched,
 * and a provider that fails or takes longer than
 * {@link episodeVersionsBudgetMs} is left out.
 *
 * @param episode - Position within the season, from 1.
 *
 * @throws {@link SeasonNotFoundError} when the season does not exist.
 * @throws {@link EpisodeNotFoundError} when the season has no such episode,
 *   or it is an extra only TMDB lists.
 */
export async function getEpisodeVersions(seasonId: string, episode: number): Promise<EpisodeVersion[]> {
  const located = await locateEpisode(seasonId, episode);
  const deadline = startDeadline(episodeVersionsBudgetMs);
  try {
    const { listings } = await listAnimeUnits(await getAnime(located.anilistId), deadline.reached);
    return versionsOffered(listings.filter(({ unit }) => unit.number === located.anilistEpisode));
  } finally {
    deadline.clear();
  }
}

/**
 * Lists the languages each AniList episode can be watched in, waiting at most
 * `budgetMs` on providers.
 *
 * Providers that answered in time are used. An episode none of them offers
 * while others are still being looked up is unknown rather than unwatchable;
 * those lookups carry on in the background, so a later call finds them
 * stored.
 *
 * @returns Languages keyed by {@link anilistEpisodeKey}, or `null` for an
 *   episode that is not known yet or whose anime could not be loaded.
 */
export async function findEpisodeLanguages(
  episodes: readonly {
    anilistId: number;
    episode: number;
  }[],
  budgetMs: number
): Promise<Map<string, ContentLanguage[] | null>> {
  const anilistIds = [...new Set(episodes.map((episode) => episode.anilistId))];
  const deadline = startDeadline(budgetMs);
  const listingsById = new Map(
    await Promise.all(
      anilistIds.map(async (anilistId) => {
        const anime = await Promise.race([getAnime(anilistId).catch(() => null), deadline.reached]);
        return [anilistId, anime && anime !== timedOut ? await listAnimeUnits(anime, deadline.reached) : null] as const;
      })
    )
  );
  deadline.clear();

  const found = new Map<string, ContentLanguage[] | null>();
  for (const { anilistId, episode } of episodes) {
    const listed = listingsById.get(anilistId);
    const versions = listed ? versionsOffered(listed.listings.filter(({ unit }) => unit.number === episode)) : [];
    found.set(anilistEpisodeKey(anilistId, episode), !listed || (versions.length === 0 && listed.pending) ? null : languagesOf(versions));
  }

  return found;
}

/** What {@link startDeadline} resolves with once its time is up. */
const timedOut = Symbol("timedOut");

/** A promise that resolves with {@link timedOut} after `ms`, and a way to cancel it. */
function startDeadline(ms: number) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const reached = new Promise<typeof timedOut>((resolve) => {
    timer = setTimeout(resolve, ms, timedOut);
  });

  return {
    reached,
    clear: () => clearTimeout(timer)
  };
}

/** Episode lists the providers returned before a deadline. */
interface AnimeListings {
  listings: ListedUnit[];
  /** Whether some provider had not answered by the deadline. */
  pending: boolean;
}

/**
 * Every episode of an anime as the providers that list languages truthfully
 * list it, asking them all at once and waiting until `deadline`. A failing
 * provider is left out.
 */
async function listAnimeUnits(anime: Anime, deadline: Promise<typeof timedOut>): Promise<AnimeListings> {
  const sources = streamProviders.filter((source) => source.listsLanguages);
  const results = await Promise.all(
    sources.map((source) =>
      Promise.race([
        lookUpUnits(anime, source.provider).catch((): ProviderUnit[] => []),
        deadline
      ])
    )
  );

  return {
    listings: results.flatMap((units, index) => {
      const source = sources[index];
      return units !== timedOut && source
        ? units.map((unit) => ({
            source,
            unit
          }))
        : [];
    }),
    pending: results.includes(timedOut)
  };
}

/**
 * Provider lookups in flight, keyed by anime and provider, so listings made
 * while one is running wait on it instead of starting another.
 */
const lookupsInFlight = new Map<string, Promise<ProviderUnit[]>>();

function lookUpUnits(anime: Anime, provider: BaseProvider): Promise<ProviderUnit[]> {
  const key = `${anime.id}:${provider.id}`;
  const running = lookupsInFlight.get(key);
  if (running) {
    return running;
  }

  const lookup = getProviderUnits(anime, provider).finally(() => lookupsInFlight.delete(key));
  lookupsInFlight.set(key, lookup);
  return lookup;
}
