import type { AudioMode } from '../audio';
import { toAnimeDetails } from '../catalog/details';
import {
    getEpisodeRevision,
    getRelatedReleaseTitles,
    getStoredAiringSchedule,
    needsEpisodeMetadataRefresh,
} from '../catalog/episodes';
import { getEpisodes } from '../providers/episode-inventory';
import {
    getAnimeOverview,
    getAnimeRelease,
    storedAnimeRelease,
} from '../catalog/anilist/anilist-release';
import { episodesAvailableToWatch } from '../providers/inventory';
import {
    discoverEpisodeInventory,
    ensureEpisodeInventoryBackfill,
    EpisodeInventoryUnresolvedError,
    enqueueEpisodeInventoryBackfill,
    getEpisodeInventoryState,
    retryEpisodeInventoryBackfill,
} from '../catalog/episode-sync';
import { getFranchiseOrder, getStoredFranchiseOrder } from '../catalog/franchise';
import {
    AniKotoNoMatchError,
    isAniKotoTransientError,
    anikotoProvider,
} from '../providers/anikoto';
import {
    getEpisodeSkipTimes,
    getSegmentTemplates,
    saveAniKotoSkipTimes,
} from '../playback/skip-times';
import { resolveAnimeSynopsis } from '../catalog/synopsis';
import { getArtwork } from '../catalog/tmdb/artwork';
import { findMapping } from '../catalog/tmdb/mapping-store';
import { getStoredMedia, refreshArtwork, selectArtwork, setLogoSize } from '../catalog/tmdb/media';
import { getEpisodePlaybackProgress, getPlaybackProgress } from '../user/progress/store';
import { resumePosition } from '../user/progress/continue';
import { getWatchlistState } from '../user/watchlist/store';

/**
 * Load the inexpensive, initially rendered portion of an anime page.
 * Stored metadata is preferred, with the provider overview used when no release is
 * stored. Episode details are intentionally left to the page's later request.
 */
export async function animePageOverview(userId: string | undefined, id: number) {
    const stored = await storedAnimeRelease(id);
    const anime = stored ?? (await getAnimeOverview(id));

    const [storedAiringSchedule, episodeRevision, watchlistState] = await Promise.all([
        getStoredAiringSchedule(id),
        getEpisodeRevision(id),
        getWatchlistState(userId, id),
    ]);

    return {
        anime: toAnimeDetails(anime, anime.description, storedAiringSchedule),
        episodeRevision,
        watchlistState,
    };
}

async function storedAnimePage(
    userId: string | undefined,
    id: number,
    anime: Awaited<ReturnType<typeof storedAnimeRelease>>
) {
    if (!anime) {
        return null;
    }

    const [
        episodes,
        artwork,
        synopsis,
        storedAiringSchedule,
        episodeRevision,
        watchlistState,
        episodeProgress,
        franchise,
    ] = await Promise.all([
        getEpisodes(anime),
        getStoredMedia(id).catch(() => null),
        resolveAnimeSynopsis(anime),
        getStoredAiringSchedule(id),
        getEpisodeRevision(id),
        getWatchlistState(userId, id),
        getEpisodePlaybackProgress(userId, id),
        anime.idMal ? getStoredFranchiseOrder(anime.idMal) : Promise.resolve(null),
    ]);
    const episodeInventory = await getEpisodeInventoryState(anime, episodes.length);
    if (episodeInventory.status === 'pending' && episodes.length === 0) {
        await enqueueEpisodeInventoryBackfill(id);
    }
    const episodesWithProgress = episodes.map((episode) => ({
        ...episode,
        progress: episodeProgress.get(episode.id) ?? null,
    }));
    // Movies have no episode-specific still, so use the selected movie backdrop for their rows.
    const backdrop = anime.format === 'MOVIE' ? artwork?.artwork.selectedBackdrop?.url : undefined;
    const details = toAnimeDetails(anime, synopsis, storedAiringSchedule);
    return {
        anime: details,
        episodeRevision,
        watchlistState,
        episodes: backdrop
            ? episodesWithProgress.map((episode) => ({ ...episode, image: backdrop }))
            : episodesWithProgress,
        audio: [...new Set(episodesWithProgress.flatMap(({ audio }) => audio))],
        episodeInventory,
        franchise,
        artwork: artwork?.artwork ?? null,
    };
}

/**
 * Load an anime page from stored release data, importing a provider release when
 * necessary. Returns `null` when neither source can resolve the requested release.
 */
export async function animePage(userId: string | undefined, id: number) {
    const stored = await storedAnimeRelease(id);
    if (!stored) {
        return storedAnimePage(userId, id, await getAnimeRelease(id));
    }

    return storedAnimePage(userId, id, stored);
}

/**
 * Return episode changes since the client's known revision and IDs.
 * `replace` signals that the client must replace its list; a missing stored release
 * returns `null`, while an unchanged revision can produce an empty additions list.
 */
export async function animePageEpisodeUpdates(
    userId: string | undefined,
    id: number,
    revision: string | null,
    knownEpisodeIds: string[]
) {
    const anime = await storedAnimeRelease(id);
    if (!anime) {
        return null;
    }

    const [currentRevision, episodes, episodeProgress] = await Promise.all([
        getEpisodeRevision(id),
        getEpisodes(anime),
        getEpisodePlaybackProgress(userId, id),
    ]);
    const episodeInventory = await getEpisodeInventoryState(anime, episodes.length);
    const episodesWithProgress = episodes.map((episode) => ({
        ...episode,
        progress: episodeProgress.get(episode.id) ?? null,
    }));
    const known = new Set(knownEpisodeIds);
    const storedEpisodeIds = new Set(episodesWithProgress.map(({ id }) => id));
    const additions = episodesWithProgress.filter((episode) => !known.has(episode.id));
    const stale = [...known].some((knownEpisodeId) => !storedEpisodeIds.has(knownEpisodeId));
    // A revision change with no additions can still mean episodes were removed or reordered.
    // In that case send the full list so the client can reconcile its view.
    const replace = currentRevision !== revision && (stale || additions.length === 0);

    return {
        revision: currentRevision,
        episodes: replace ? episodesWithProgress : additions,
        replace,
        audio: [...new Set(episodesWithProgress.flatMap(({ audio }) => audio))],
        episodeInventory,
    };
}

/**
 * Retry a queued episode-inventory backfill and return the resulting inventory state.
 * Returns `null` when the anime has no stored release to retry against.
 */
export async function retryAnimePageEpisodeInventory(id: number) {
    const anime = await storedAnimeRelease(id);
    if (!anime) {
        return null;
    }

    await retryEpisodeInventoryBackfill(id);
    return getEpisodeInventoryState(anime, (await getEpisodes(anime)).length);
}

/**
 * Load the deferred anime-page data, including episode discovery when inventory is
 * absent or stale. Discovery failures known to be transient or unresolved fall back
 * to stored episodes; unexpected failures propagate to the caller.
 */
export async function animePageDeferred(userId: string | undefined, id: number) {
    const stored = await storedAnimeRelease(id);
    const imported = !stored;
    const anime =
        stored?.metadataSource === 'kitsu'
            ? await getAnimeRelease(id)
            : (stored ?? (await getAnimeRelease(id)));
    const storedMapping = await findMapping(id);
    const storedEpisodes = await getEpisodes(anime);
    const metadataNeedsRefresh = storedMapping
        ? await needsEpisodeMetadataRefresh(id, storedMapping.externalIdId)
        : false;
    const shouldDiscover =
        imported || !storedMapping || storedEpisodes.length === 0 || metadataNeedsRefresh;
    if (shouldDiscover && !imported) {
        await ensureEpisodeInventoryBackfill(id);
    }
    const initialEpisodes = shouldDiscover
        ? await discoverEpisodeInventory(anime)
              .then((entries) => episodesAvailableToWatch(entries, anime))
              .catch((cause) => {
                  if (
                      !isAniKotoTransientError(cause) &&
                      !(cause instanceof AniKotoNoMatchError) &&
                      !(cause instanceof EpisodeInventoryUnresolvedError)
                  ) {
                      throw cause;
                  }
                  return null;
              })
        : null;
    const [synopsis, storedAiringSchedule, episodeProgress] = await Promise.all([
        resolveAnimeSynopsis(anime, { refresh: imported }),
        getStoredAiringSchedule(id),
        getEpisodePlaybackProgress(userId, id),
    ]);
    const episodes = (initialEpisodes ?? storedEpisodes).map((episode) => ({
        ...episode,
        progress: episodeProgress.get(episode.id) ?? null,
    }));
    const details = toAnimeDetails(anime, synopsis, storedAiringSchedule);
    const episodeInventory = await getEpisodeInventoryState(anime, episodes.length);
    if (episodeInventory.status === 'pending' && episodes.length === 0) {
        await enqueueEpisodeInventoryBackfill(id);
    }
    const franchise = anime.idMal ? await getFranchiseOrder(anime.idMal).catch(() => null) : null;

    return {
        anime: details,
        episodes,
        audio: [...new Set(episodes.flatMap(({ audio }) => audio))],
        episodeInventory,
        franchise,
    };
}

/**
 * Load artwork for the anime page, refreshing when no stored provider mapping exists.
 * Artwork lookup failures are represented as `null` so the page can render without it.
 */
export async function animePageArtwork(id: number) {
    const stored = await storedAnimeRelease(id);
    const anime = stored ?? (await getAnimeRelease(id));
    const storedMapping = await findMapping(id);
    return getArtwork(anime, { refresh: !storedMapping, fetchMissing: true }).catch(() => null);
}

/**
 * Load persisted media artwork when available, otherwise build a media-page result
 * from the anime release and fetch its artwork. Missing artwork does not fail the page.
 */
export async function mediaPage(id: number) {
    const stored = await getStoredMedia(id).catch(() => null);
    if (stored) {
        return stored;
    }

    const existing = await storedAnimeRelease(id);
    const anime = existing ?? (await getAnimeRelease(id));
    return {
        anime: toAnimeDetails(anime),
        artwork: await getArtwork(anime, {
            refresh: true,
            fetchMissing: true,
        }).catch(() => null),
    };
}

type MediaUpdate =
    | { intent: 'refresh' }
    | { intent: 'logoSize'; logoSize: number }
    | { intent: 'select'; type: 'backdrop' | 'logo'; filePath: string | null };

/**
 * Apply a media-page mutation: refresh artwork, change the logo display size, or
 * select/clear a backdrop or logo. The operation persists through the media store.
 */
export async function updateMedia(id: number, update: MediaUpdate) {
    if (update.intent === 'refresh') {
        await refreshArtwork(id);
    } else if (update.intent === 'logoSize') {
        await setLogoSize(id, update.logoSize);
    } else {
        await selectArtwork(id, update.type, update.filePath);
    }
}

function legacySlug(title: string, episodeId: string) {
    return (
        title
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '') || `episode-${episodeId}`
    );
}

async function episodePlayback(
    anime: Parameters<typeof anikotoProvider.getStreams>[0],
    episode: Parameters<typeof anikotoProvider.getStreams>[1],
    modes: AudioMode[]
) {
    try {
        const playback = await anikotoProvider.getStreams(anime, episode, modes);
        if (playback.skipTimes) {
            await saveAniKotoSkipTimes({
                anilistId: anime.id,
                episodeId: episode.id,
                times: playback.skipTimes,
            }).catch(() => {});
        }

        return {
            streams: playback.streams,
            skipTimes: playback.skipTimes,
            error: !Object.values(playback.streams).some((sources) => sources?.length),
        };
    } catch {
        return {
            streams: {},
            skipTimes: null,
            error: true,
        };
    }
}

/**
 * Resolve a watch URL's episode identifier against the current release inventory.
 *
 * Identifiers may be stored episode IDs, unique numeric episode numbers, or legacy
 * title slugs. Numeric matches must be unique because specials and split releases
 * can reuse a displayed number; unresolved or ambiguous identifiers return `null`.
 */
async function watchEpisode(id: number, episodeId: string) {
    const anime = await getAnimeRelease(id);
    const episodes = await getEpisodes(anime);
    let currentIndex = episodes.findIndex(({ id: candidate }) => candidate === episodeId);

    if (currentIndex < 0) {
        const normalized = episodeId.trim();
        const number = /^\d+(?:\.\d+)?$/.test(normalized) ? Number(normalized) : NaN;
        if (Number.isFinite(number)) {
            const matching = episodes.flatMap((episode, index) =>
                episode.number === number ? [index] : []
            );
            // Episode numbers are not guaranteed unique; refusing ambiguous matches avoids
            // silently opening a different release entry when the URL contains only a number.
            if (matching.length !== 1) {
                return null;
            }
            currentIndex = matching[0];
        }
    }
    if (currentIndex < 0) {
        currentIndex = episodes.findIndex(
            (episode) => legacySlug(episode.title, episode.id) === episodeId
        );
    }
    if (currentIndex < 0) {
        return null;
    }

    return { anime, episodes, currentIndex };
}

/**
 * Assemble watch-page data, including adjacent episodes and the saved resume point.
 * Returns `null` when the episode identifier cannot be resolved in the release.
 */
export async function watchPage(userId: string | undefined, id: number, episodeId: string) {
    const context = await watchEpisode(id, episodeId);
    if (!context) {
        return null;
    }

    const { anime, currentIndex } = context;
    const [storedMedia, progress, episodeProgress] = await Promise.all([
        getStoredMedia(id).catch(() => null),
        getPlaybackProgress(userId, id),
        getEpisodePlaybackProgress(userId, id),
    ]);
    const backdrop =
        anime.format === 'MOVIE' ? storedMedia?.artwork.selectedBackdrop?.url : undefined;
    const episodes = context.episodes.map((episode) => ({
        ...episode,
        image: backdrop ?? episode.image,
        progress: episodeProgress.get(episode.id) ?? null,
    }));
    const currentEpisode = episodes[currentIndex];

    return {
        anime: toAnimeDetails(anime),
        poster: storedMedia?.artwork.selectedPoster?.url ?? null,
        logo: storedMedia?.artwork.selectedLogo
            ? {
                  url: storedMedia.artwork.selectedLogo.url,
                  size: storedMedia.artwork.logoSize,
              }
            : null,
        episodes,
        currentEpisode,
        previousEpisode: episodes[currentIndex - 1] ?? null,
        nextEpisode: episodes[currentIndex + 1] ?? null,
        fallbackImage: storedMedia?.artwork.selectedBackdrop?.url ?? anime.bannerImage ?? null,
        startAt: resumePosition(episodeProgress.get(currentEpisode.id) ?? null, currentEpisode.id),
        progressEventAt: Math.max(Date.now(), progress?.eventAt.getTime() ?? 0),
    };
}

/**
 * Load skip-time and segment-template data for a resolved episode. Missing segment
 * sources degrade to empty values; an unresolvable episode returns `null`.
 */
export async function watchSegments(id: number, episodeId: string) {
    const context = await watchEpisode(id, episodeId);
    if (!context) {
        return null;
    }

    return Promise.all([
        getEpisodeSkipTimes({
            anilistId: id,
            episodeId: context.episodes[context.currentIndex].id,
            episodeNumber: context.episodes[context.currentIndex].number,
            malId: context.anime.idMal,
        }).catch(() => ({
            opening: null,
            ending: null,
            sources: { opening: null, ending: null },
        })),
        getSegmentTemplates(id, context.episodes[context.currentIndex].number).catch(() => ({
            opening: null,
            ending: null,
        })),
    ]).then(([times, templates]) => ({ times, templates }));
}

/**
 * Resolve playable streams for an episode, including release and special-order
 * context required by the provider. Returns `null` for an unknown episode; provider
 * failures are converted into an empty stream result with its error flag set.
 */
export async function watchPlayback(id: number, episodeId: string) {
    const context = await watchEpisode(id, episodeId);
    if (!context) {
        return null;
    }

    const { anime, episodes, currentIndex } = context;
    const currentEpisode = episodes[currentIndex];
    const release = episodes.map(({ number, title }) => ({ number, title }));
    const specials = episodes.filter(({ number }) => number <= 0 || !Number.isInteger(number));
    const specialIndex = specials.findIndex(({ id: candidate }) => candidate === currentEpisode.id);
    const releaseRelations = new Set(['PARENT', 'PREQUEL', 'SEQUEL']);
    const relatedReleases = await getRelatedReleaseTitles(
        (anime.relations?.edges ?? []).flatMap((edge) =>
            edge?.relationType &&
            releaseRelations.has(edge.relationType) &&
            edge.node?.type === 'ANIME' &&
            edge.node.id !== id
                ? [edge.node.id]
                : []
        )
    );
    const playbackEpisode =
        specialIndex < 0
            ? { ...currentEpisode, release, relatedReleases }
            : {
                  ...currentEpisode,
                  release,
                  relatedReleases,
                  specialIndex: specialIndex + 1,
                  specialCount: specials.length,
              };

    return episodePlayback(anime, playbackEpisode, [
        'sub',
        'dub',
        ...(currentEpisode.audio.includes('raw') ? (['raw'] as const) : []),
    ]);
}
