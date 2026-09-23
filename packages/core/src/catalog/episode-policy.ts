import type { AniListAnime } from './anilist/anilist-types';
import type { AnimeEpisode } from '../types';
type EpisodeMetadataCompleteness = Pick<AnimeEpisode, 'image' | 'title' | 'overview'>;

export const episodeMetadataRevision = 'tmdb-episode-v7';

export function canPreserveEpisodeMetadata(
    previousExternalIdId: number | null,
    currentExternalIdId: number | null
) {
    // A source change invalidates fields from the previous provider. A missing
    // current source is different: transient lookup failure should not erase data.
    return currentExternalIdId === null || previousExternalIdId === currentExternalIdId;
}

export function episodeMetadataNeedsRefresh(
    episodes: readonly EpisodeMetadataCompleteness[],
    hasMetadataSource: boolean,
    metadataRevision: string | null | undefined = episodeMetadataRevision
) {
    // Bump the revision when the required episode fields or their reconciliation
    // rules change; stored rows at an older revision then refresh once.
    return (
        hasMetadataSource &&
        (metadataRevision !== episodeMetadataRevision ||
            episodes.length === 0 ||
            episodes.some(
                ({ image, title, overview }) => !image?.trim() || !title.trim() || !overview.trim()
            ))
    );
}

export function episodeMetadataRefreshRequired(
    episodes: readonly EpisodeMetadataCompleteness[],
    sync: {
        metadataExternalIdId: number | null;
        metadataRevision: string | null;
    } | null,
    metadataExternalIdId: number
) {
    return (
        !sync ||
        sync.metadataExternalIdId !== metadataExternalIdId ||
        episodeMetadataNeedsRefresh(episodes, true, sync.metadataRevision)
    );
}

export function episodeMetadataRevisionAfterSync(
    episodes: readonly EpisodeMetadataCompleteness[],
    metadataAvailable: boolean,
    hasMetadataSource: boolean
) {
    if (!metadataAvailable || !hasMetadataSource) {
        return null;
    }

    return episodeMetadataNeedsRefresh(episodes, true) ? null : episodeMetadataRevision;
}

export function nextRefreshAt(anime: AniListAnime, stableSince: Date) {
    // Airing titles follow the next episode, while stable terminal states are
    // checked less often to keep catalog freshness without constant polling.
    const now = Date.now();
    const after = (milliseconds: number) => new Date(now + milliseconds);
    const nextAiringAt = anime.nextAiringEpisode?.airingAt
        ? anime.nextAiringEpisode.airingAt * 1_000 + 15 * 60 * 1_000
        : null;

    switch (anime.status) {
        case 'RELEASING':
            return new Date(Math.min(nextAiringAt ?? Infinity, now + 6 * 60 * 60 * 1_000));
        case 'FINISHED': {
            return after(7 * 24 * 60 * 60 * 1_000);
        }
        case 'CANCELLED':
            return now - stableSince.getTime() >= 7 * 24 * 60 * 60 * 1_000
                ? after(30 * 24 * 60 * 60 * 1_000)
                : after(7 * 24 * 60 * 60 * 1_000);
        case 'HIATUS':
            return after(7 * 24 * 60 * 60 * 1_000);
        case 'NOT_YET_RELEASED':
            return nextAiringAt
                ? new Date(Math.min(nextAiringAt, now + 24 * 60 * 60 * 1_000))
                : after(24 * 60 * 60 * 1_000);
        default:
            return after(6 * 60 * 60 * 1_000);
    }
}
