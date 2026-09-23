import { db } from '@soraorg/database';

import type { AnimeSearchResult } from '../search';
import { rankAnimeSearch } from '../search';
import { SearchAnimePageDocument } from './anilist/graphql/graphql.generated';
import { request } from './anilist/anilist-client';
import { enrichAnimeCards } from './card-enrichment';
import { createAnimeSearchIndex } from './search-index';
import { withAnimeSearchMetadata } from './search-enrichment';
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
    return withAnimeSearchMetadata<AnimeSearchResult>(
        await enrichAnimeCards<AnimeSearchResult>(results)
    );
}
