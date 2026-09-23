import type { BrowseFilters } from './browse-filters';
import type { BrowseCatalogEntry } from './browse-types';
import type { CatalogBrowsePageRequest } from './source';
import { catalogSnapshotKey, refreshCatalogPage } from './storage';

export async function refreshPopularCatalog<Filters extends Omit<BrowseFilters, 'audio'>>(
    filters: Filters,
    fetchPage: (
        request: Omit<CatalogBrowsePageRequest, 'filters'> & { filters: Filters }
    ) => Promise<{
        anime: BrowseCatalogEntry[];
        hasNextPage: boolean;
    }>,
    refreshedAt = new Date()
) {
    const entries: BrowseCatalogEntry[] = [];
    for (let page = 1; ; page += 1) {
        const result = await fetchPage({
            filters,
            page,
            perPage: 42,
            forceRefresh: true,
        });
        entries.push(...result.anime);
        if (!result.hasNextPage) {
            break;
        }
    }

    const unique = new Map<number, BrowseCatalogEntry>();
    for (const entry of entries) {
        if (!unique.has(entry.anilistId)) {
            unique.set(entry.anilistId, entry);
        }
    }

    const ordered = [...unique.values()].toSorted(
        (left, right) =>
            (right.popularity ?? -1) - (left.popularity ?? -1) ||
            left.title.localeCompare(right.title, 'en') ||
            left.anilistId - right.anilistId
    );
    const pages: BrowseCatalogEntry[][] = [];
    for (let offset = 0; offset < ordered.length; offset += 42) {
        pages.push(ordered.slice(offset, offset + 42));
    }

    for (const [index, page] of pages.entries()) {
        await refreshCatalogPage(
            catalogSnapshotKey(filters, index + 1),
            page,
            index < pages.length - 1,
            refreshedAt
        );
    }

    if (!pages.length) {
        await refreshCatalogPage(catalogSnapshotKey(filters, 1), [], false, refreshedAt);
    }

    return {
        animeIds: pages[0]?.map(({ anilistId }) => anilistId) ?? [],
        hasNextPage: pages.length > 1,
    };
}
