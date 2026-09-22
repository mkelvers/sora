import { SearchAnimePageDocument } from './anilist/graphql/generated/graphql';
import type { AnimeCard, AnimeCardPage } from '../types';
import type { AnimeSearchResult } from '../search';
import type { BrowseSourceTaxonomy } from './browse-transform';
import type { CatalogSource, HomeHero } from './source';
import { animeCard } from './card';
import { animeTitles, mediaTitle } from './anilist/anilist-text';
import { isDiscoverableAnime } from './discovery';
import {
    getBrowsePage,
    getBrowseTaxonomy,
    type AniListBrowseFilters,
} from './anilist/anilist-browse';
import { discoverReleaseCalendar } from './anilist/anilist-calendar';
import { getEpisodes } from '../providers/episode-inventory';
import { request } from './anilist/anilist-client';
import { storedAnimeRelease } from './anilist/anilist-release';
import { getAniKotoSimulcastPage } from '../providers/anikoto';
import { enrichAnimeCards } from './card-enrichment';
import { withAnimeSearchMetadata } from './search-enrichment';
import { getArtwork } from './tmdb';
import { resolveHeroSynopsis } from './synopsis';
import { getContinueWatchingCards } from '../user/progress/store';
import { logger } from '../application/logger';

async function loadHomeHero(id: number): Promise<HomeHero | null> {
    try {
        const details = await storedAnimeRelease(id);
        if (!details || !isDiscoverableAnime(details)) {
            return null;
        }

        const artwork = await getArtwork(details, { fetchMissing: false });
        if (!artwork?.selectedBackdrop || !artwork.selectedLogo) {
            return null;
        }

        const episodes = await getEpisodes(details);
        if (!episodes[0]) {
            return null;
        }

        return {
            id,
            title: mediaTitle(details),
            image: artwork.selectedBackdrop.url,
            logo: {
                url: artwork.selectedLogo.url,
                size: artwork.logoSize,
            },
            audio: [...new Set(episodes.flatMap(({ audio }) => audio))],
            genres: details.genres?.filter((genre) => genre !== null) ?? [],
            description: await resolveHeroSynopsis(details),
        };
    } catch (cause) {
        logger.debug(`Homepage hero candidate ${id} failed`, cause);
        return null;
    }
}

async function search(query: string): Promise<AnimeSearchResult[]> {
    const response = await request(
        SearchAnimePageDocument,
        { search: query, page: 1, perPage: 50 },
        { refreshAfterMs: 24 * 60 * 60 * 1_000 }
    );

    return (response.Page?.media?.filter((value) => value !== null) ?? []).flatMap((entry) => {
        const card = animeCard(entry);
        if (!card) {
            return [];
        }

        return [
            {
                ...card,
                titles: animeTitles(entry),
                format: entry.format ?? null,
                popularity: entry.popularity ?? 0,
                backdrop: null,
            },
        ];
    });
}

export function createCatalogSource(): CatalogSource {
    return {
        browsePage: ({ filters, page, perPage, forceRefresh }) =>
            getBrowsePage({
                filters: filters as AniListBrowseFilters,
                page,
                perPage,
                forceRefresh,
            }),
        browseTaxonomy: (forceRefresh): Promise<BrowseSourceTaxonomy> =>
            getBrowseTaxonomy(forceRefresh),
        search,
        releaseCalendar: discoverReleaseCalendar,
        simulcastPage: async (selection, page): Promise<AnimeCardPage> =>
            getAniKotoSimulcastPage(selection, page),
        loadHomeHero,
        continueWatching: getContinueWatchingCards,
        enrichAnimeCards: <T extends AnimeCard>(cards: T[]) => enrichAnimeCards(cards),
        enrichSearchMetadata: <T extends AnimeSearchResult>(results: T[]) =>
            withAnimeSearchMetadata(results),
    };
}
