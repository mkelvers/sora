import { inArray } from 'drizzle-orm';

import { db } from '@soraorg/database';
import { animeEpisode } from '@soraorg/database/schema';

import { audioModesByAnime } from '../audio';
import type { AnimeSearchResult } from '../search';
import { rankAnimeSearch } from '../search';
import { SearchAnimePageDocument } from './anilist/graphql/graphql.generated';
import { request } from './anilist/anilist-client';
import { enrichAnimeCards } from './card-enrichment';
import { createAnimeSearchIndex } from './search-index';
import { imageUrl } from './tmdb/client';
import { getStoredBackdropCandidates, uniqueBackdropCandidates } from './tmdb/media';
import { animeTitles, mediaTitle, plainText } from './utils';

const searchIndex = createAnimeSearchIndex(db);

async function search(query: string): Promise<AnimeSearchResult[]> {
    const response = await request(
        SearchAnimePageDocument,
        {
            search: query,
            page: 1,
            perPage: 50,
        },
        { refreshAfterMs: 24 * 60 * 60 * 1_000 }
    );

    return (response.Page?.media?.filter((value) => value !== null) ?? []).flatMap((entry) => {
        const image = entry.coverImage?.extraLarge ?? entry.coverImage?.large ?? null;
        if (!image) {
            return [];
        }

        return [
            {
                id: entry.id,
                title: mediaTitle(entry),
                image,
                audio: [],
                status: null,
                score: entry.averageScore ?? 0,
                genres: entry.genres?.filter((genre): genre is string => genre !== null) ?? [],
                synopsis: plainText(entry.description),
                titles: animeTitles(entry),
                format: entry.format ?? null,
                popularity: entry.popularity ?? 0,
                backdrop: null,
            },
        ];
    });
}

async function storedArtwork(anilistIds: number[]) {
    const rows = await getStoredBackdropCandidates(anilistIds);

    return new Map(
        [
            ...uniqueBackdropCandidates(rows, (row) => `tmdb:${row.mediaType}:${row.targetId}`),
        ].flatMap(([anilistId, row]) => [
            [
                anilistId,
                {
                    backdrop: row.filePath ? imageUrl(row.filePath, 'w780') : null,
                },
            ] as const,
        ])
    );
}

export async function getSearchResults(query: string) {
    const normalized = query.trim();
    if (!normalized) {
        return [];
    }

    let results = await searchIndex.find(normalized);
    if (!results.length) {
        results = rankAnimeSearch(normalized, await search(normalized));
        await searchIndex.store(results);
    }
    const cards = await enrichAnimeCards<AnimeSearchResult>(results);
    const anilistIds = [...new Set(cards.map(({ id }) => id))];
    if (!anilistIds.length) {
        return cards;
    }

    const [artwork, episodeRows] = await Promise.all([
        storedArtwork(anilistIds),
        db
            .select({
                anilistId: animeEpisode.anilistId,
                audio: animeEpisode.audio,
            })
            .from(animeEpisode)
            .where(inArray(animeEpisode.anilistId, anilistIds)),
    ]);
    const audioByAnime = audioModesByAnime(episodeRows);
    return cards.map((card) => ({
        ...card,
        backdrop: artwork.get(card.id)?.backdrop ?? null,
        audio: [...(audioByAnime.get(card.id) ?? [])],
    }));
}
