import { inArray } from 'drizzle-orm';

import type { AudioMode } from '../audio';
import type { AnimeSearchResult, SearchArtwork } from '../search';
import { db } from '@soraorg/shared/db';
import { animeEpisode } from '@soraorg/shared/db/schema';
import { getStoredBackdropCandidates, imageUrl, uniqueBackdropCandidates } from './tmdb';

async function storedArtwork(anilistIds: number[]) {
    const rows = await getStoredBackdropCandidates(anilistIds);

    return new Map(
        [
            ...uniqueBackdropCandidates(rows, (row) => `tmdb:${row.mediaType}:${row.targetId}`),
        ].flatMap(([anilistId, row]) => [
            [
                anilistId,
                {
                    group: `tmdb:${row.mediaType}:${row.targetId}`,
                    backdrop: row.filePath ? imageUrl(row.filePath, 'w780') : null,
                },
            ] as const,
        ])
    );
}

async function storedPlayback(anilistIds: number[]) {
    const rows = await db
        .select({
            anilistId: animeEpisode.anilistId,
            number: animeEpisode.number,
            audio: animeEpisode.audio,
        })
        .from(animeEpisode)
        .where(inArray(animeEpisode.anilistId, anilistIds));

    const playback = new Map<number, { audio: Set<AudioMode>; number: number }>();
    for (const row of rows) {
        const stored = playback.get(row.anilistId);
        if (!stored) {
            playback.set(row.anilistId, {
                audio: new Set(row.audio),
                number: row.number,
            });
            continue;
        }

        row.audio.forEach((mode) => stored.audio.add(mode));
        if (row.number > 0 && (stored.number <= 0 || row.number < stored.number)) {
            stored.number = row.number;
        }
    }

    return playback;
}

export async function withAnimeSearchMetadata<T extends AnimeSearchResult>(results: T[]) {
    const anilistIds = [...new Set(results.map(({ id }) => id))];
    if (!anilistIds.length) {
        return results;
    }

    const artworkIds = anilistIds;
    const [artwork, playback] = await Promise.all([
        storedArtwork(artworkIds),
        storedPlayback(anilistIds),
    ]);
    return results.map((result) => {
        const stored = playback.get(result.id);
        const selectedArtwork = artwork.get(result.id);
        return {
            ...result,
            backdrop: selectedArtwork?.backdrop ?? null,
            audio: stored ? [...stored.audio] : [],
        };
    });
}
