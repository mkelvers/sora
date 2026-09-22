import { animeDate, dateTimestamp, formatAirDate } from './date';
import type { AniListAnime } from './anilist/anilist-types';
import type { ProviderEpisode } from '../providers/types';

export type EpisodeSource = Pick<ProviderEpisode, 'id' | 'number' | 'supplemental'>;

export function providerConfirmsEpisode(episodes: readonly EpisodeSource[], targetEpisode: number) {
    return episodes.some(
        (episode) => episode.number === targetEpisode && Boolean(episode.id.trim())
    );
}

export function confirmedEpisodeAirDate(
    episodeNumber: number,
    fallback: string | null,
    confirmation: {
        targetEpisode: number;
        airingAt: Date;
    }
) {
    if (episodeNumber !== confirmation.targetEpisode) {
        return fallback;
    }

    return formatAirDate(confirmation.airingAt);
}

export function preferredEpisodeAirDate(
    episodeNumber: number,
    metadataAirDate: string | null,
    confirmedAiringAt: Date | null | undefined
) {
    return confirmedAiringAt
        ? confirmedEpisodeAirDate(episodeNumber, metadataAirDate, {
              targetEpisode: episodeNumber,
              airingAt: confirmedAiringAt,
          })
        : metadataAirDate;
}

function metadataDate(
    metadata:
        | {
              airDate: string;
              rawAirDate?: string | null;
          }
        | undefined
) {
    if (!metadata) {
        return null;
    }

    const raw = metadata.rawAirDate;
    if (raw) {
        const timestamp = Date.parse(`${raw}T00:00:00Z`);
        return Number.isFinite(timestamp) ? timestamp : null;
    }

    const [month, date, year] = metadata.airDate.split('/').map(Number);
    if (!year || !month || !date) {
        return null;
    }

    return Date.UTC(year, month - 1, date);
}

function normalizeReleaseWindow<T extends EpisodeSource>(episodes: T[], expected: number) {
    const firstSelectedNumber = episodes[0]?.number;
    if (
        episodes.length !== expected ||
        !Number.isInteger(firstSelectedNumber) ||
        firstSelectedNumber <= 1 ||
        !episodes.every(
            (episode, index) =>
                Number.isInteger(episode.number) && episode.number === firstSelectedNumber + index
        )
    ) {
        return episodes;
    }

    return episodes.map((episode, index) => ({
        ...episode,
        number: index + 1,
    }));
}

function declaredReleaseWindow<T extends EpisodeSource>(episodes: T[], expected: number) {
    if (episodes.length <= expected) {
        return episodes;
    }

    const selected = episodes.slice(0, expected);
    return selected.every(
        (episode, index) => Number.isInteger(episode.number) && episode.number === index + 1
    )
        ? selected
        : episodes;
}

/**
 * Selects one release's episode inventory from providers that can report extra
 * specials or number episodes relative to AniList's declared count. Provider
 * metadata identifiers, the anime's date range, and supplemental flags provide
 * evidence for excluding extras; when evidence is incomplete, the original
 * inventory is preserved instead of guessing. A contiguous provider window
 * whose numbering starts above one is renumbered to match AniList's release.
 */
export function episodesForRelease<T extends EpisodeSource>(
    anime: AniListAnime,
    episodes: T[],
    metadata: Map<
        string,
        {
            airDate: string;
            rawAirDate?: string | null;
        }
    > | null
) {
    const expected = anime.episodes;
    if (!expected || expected <= 0) {
        return episodes;
    }
    if (episodes.length <= expected) {
        return normalizeReleaseWindow(episodes, expected);
    }
    if (!metadata?.size) {
        return normalizeReleaseWindow(declaredReleaseWindow(episodes, expected), expected);
    }

    let selected = episodes;
    // Prefer entries with metadata only when enough matches remain to satisfy
    // AniList's declared count; sparse provider metadata is not a safe filter.
    const matched = selected.filter((episode) => metadata.has(episode.id));
    if (matched.length >= expected && matched.length < selected.length) {
        selected = matched;
    }

    // Supplemental entries are likely specials, but retain them when metadata
    // positively identifies them as part of this release.
    const confirmed = selected.filter(
        (episode) => !episode.supplemental || metadata.has(episode.id)
    );

    if (confirmed.length >= expected && confirmed.length < selected.length) {
        selected = confirmed;
    }

    const start = dateTimestamp(animeDate(anime.startDate));
    const end = dateTimestamp(animeDate(anime.endDate));

    if (start !== null || end !== null) {
        // Allow a two-week margin for source timezone and schedule differences.
        const inReleaseWindow = selected.filter((episode) => {
            const releasedAt = metadataDate(metadata.get(episode.id));
            if (releasedAt === null) {
                return true;
            }

            return !(
                (start !== null && releasedAt < start - 14 * 24 * 60 * 60 * 1_000) ||
                (end !== null && releasedAt > end + 14 * 24 * 60 * 60 * 1_000)
            );
        });

        if (inReleaseWindow.length >= expected && inReleaseWindow.length < selected.length) {
            selected = inReleaseWindow;
        }
    }

    const declared = declaredReleaseWindow(selected, expected);
    if (declared.length === expected) {
        selected = declared;
    }

    if (selected.length > expected) {
        const excess = selected.length - expected;
        const unmatchedSpecials = selected.filter(
            (episode) =>
                !metadata.has(episode.id) &&
                (episode.number <= 0 || !Number.isInteger(episode.number))
        );

        if (unmatchedSpecials.length === excess) {
            const remove = new Set(unmatchedSpecials.map(({ id }) => id));
            selected = selected.filter((episode) => !remove.has(episode.id));
        }
    }

    return normalizeReleaseWindow(selected, expected);
}
