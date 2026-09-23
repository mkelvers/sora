import type { AnimeCard, AnimeCardPage, ContinueWatchingCard } from '../types';
import type { AnimeSearchResult } from '../search';
import type { BrowseFilters } from './browse-filters';
import type { BrowseCatalogEntry } from './browse-types';
import type { BrowseSourceTaxonomy } from './browse-transform';
import type { ReleaseCalendarEntry } from './release-calendar-parser';
import type { AnimeSeasonSelection } from '../season';
import type { AudioMode } from '../audio';
import {
    SearchAnimePageDocument,
    ReleaseCalendarPageDocument,
} from './anilist/graphql/graphql.generated';
import { animeTitles, mediaTitle, plainText } from './utils';
import { request } from './anilist/anilist-client';
import { storedAnimeRelease } from './anilist/anilist-release';
import {
    getBrowsePage,
    getBrowseTaxonomy,
    type AniListBrowseFilters,
} from './anilist/anilist-browse';
import { getEpisodes } from '../providers/episode-inventory';
import { getAniKotoSimulcastPage } from '../providers/anikoto';
import { getArtwork } from './tmdb/artwork';
import { resolveHeroSynopsis } from './synopsis';
import { getContinueWatchingCards } from '../user/progress/store';
import { isDiscoverableAnime } from './discovery';
import { enrichAnimeCards } from './card-enrichment';
import { withAnimeSearchMetadata } from './search-enrichment';
import { parseReleaseCalendarPage } from './release-calendar-parser';

export type CatalogBrowseFilters = Omit<BrowseFilters, 'audio'>;

export interface HomeHero {
    id: number;
    title: string;
    image: string;
    logo: {
        url: string;
        size: number;
    };
    audio: AudioMode[];
    genres: string[];
    description: string;
}

/** Inputs needed to fetch one page from a catalog provider. */
export interface CatalogBrowsePageRequest {
    /** Validated catalog filters for this request. */

    filters: CatalogBrowseFilters;
    /** One-based page number. */
    page: number;
    /** Maximum number of entries requested for this page. */
    perPage: number;
    /** Bypass the provider's fresh snapshot when true. */
    forceRefresh?: boolean;
}

export interface CatalogSource {
    browsePage: (request: CatalogBrowsePageRequest) => Promise<{
        anime: BrowseCatalogEntry[];
        hasNextPage: boolean;
    }>;
    browseTaxonomy: (forceRefresh: boolean) => Promise<BrowseSourceTaxonomy>;
    search: (query: string) => Promise<AnimeSearchResult[]>;
    releaseCalendar: (from: Date, to: Date) => Promise<ReleaseCalendarEntry[]>;
    simulcastPage: (selection: AnimeSeasonSelection, page: number) => Promise<AnimeCardPage>;
    loadHomeHero: (id: number) => Promise<HomeHero | null>;
    continueWatching: (userId: string) => Promise<ContinueWatchingCard[]>;
    enrichAnimeCards: <T extends AnimeCard>(cards: T[]) => Promise<T[]>;
    enrichSearchMetadata: <T extends AnimeSearchResult>(results: T[]) => Promise<T[]>;
}

async function discoverReleaseCalendar(from: Date, to: Date): Promise<ReleaseCalendarEntry[]> {
    if (!(from < to)) {
        throw new RangeError('Release calendar window must be ordered');
    }

    const entries = new Map<number, ReleaseCalendarEntry>();
    const airingAtGreater = Math.floor(from.getTime() / 1_000) - 1;
    const airingAtLesser = Math.ceil(to.getTime() / 1_000) + 1;

    for (let page = 1; ; page += 1) {
        const response = await request(
            ReleaseCalendarPageDocument,
            {
                page,
                perPage: 50,
                airingAtGreater,
                airingAtLesser,
            },
            {
                forceRefresh: true,
                refreshAfterMs: 15 * 60 * 1_000,
            }
        );
        const parsed = parseReleaseCalendarPage(response);
        for (const entry of parsed.entries) {
            entries.set(entry.airingId, entry);
        }

        if (!parsed.hasNextPage) {
            break;
        }
    }

    return [...entries.values()].sort(
        (left, right) => left.airingAt.getTime() - right.airingAt.getTime()
    );
}

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
    } catch {
        return null;
    }
}

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
