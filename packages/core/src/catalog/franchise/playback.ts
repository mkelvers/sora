import type { FranchiseOrder } from '../../types';
import type { animeEpisode } from '@soraorg/database/schema';

export type FranchisePlaybackEpisode = Pick<
    typeof animeEpisode.$inferSelect,
    'anilistId' | 'episodeId' | 'number' | 'audio'
>;

export function withFranchisePlayback(
    entries: FranchiseOrder['entries'],
    episodes: FranchisePlaybackEpisode[]
) {
    const grouped = new Map<number, FranchisePlaybackEpisode[]>();

    for (const episode of episodes) {
        grouped.set(episode.anilistId, [...(grouped.get(episode.anilistId) ?? []), episode]);
    }

    return entries.map((entry) => {
        const available = grouped.get(entry.anilistId) ?? [];
        return {
            ...entry,
            audio: [...new Set(available.flatMap(({ audio }) => audio))],
        };
    });
}
