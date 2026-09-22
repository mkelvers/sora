import type { AnimeCard, AnimeCardPage, ContinueWatchingCard } from '../types';
import type { AnimeSearchResult } from '../search';
import type { BrowseFilters } from './browse-filters';
import type { BrowseCatalogEntry } from './browse-types';
import type { BrowseSourceTaxonomy } from './browse-transform';
import type { ReleaseCalendarEntry } from './release-calendar-parser';
import type { AnimeSeasonSelection } from '../season';
import type { AudioMode } from '../audio';

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
