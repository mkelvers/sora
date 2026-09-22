import { and, desc, eq, gte, inArray, lte } from 'drizzle-orm';

import { db } from '@soraorg/database';
import {
    animeCatalogRefresh,
    animeEpisode,
    animeEpisodeTarget,
    animeRelease,
} from '@soraorg/database/schema';
import { audioModesByAnime } from '../audio';
import type { AnimeCard } from '../types';
import type { BrowseFilters } from './browse-filters';
import { catalogPage } from './query';
import {
    catalogSnapshotKey,
    catalogTaxonomy,
    refreshCatalogPage,
    refreshCatalogTaxonomy,
    storedReleaseCards,
} from './storage';
import { refreshPopularCatalog } from './refresh';
import { currentAnimeSeason } from '../season';
import { homePage } from './home';
import { refreshReleaseCalendar, releaseCalendar } from './release-calendar';
import { createSearchOperation } from './search';
import { createSimulcastOperations } from './simulcast';
import type { CatalogBrowseFilters, CatalogSource } from './source';

export function createCatalogApplication(source: CatalogSource) {
    const search = createSearchOperation(source);
    const simulcast = createSimulcastOperations(source);

    async function popularAnimePage(page: number, filters: BrowseFilters) {
        if (!Number.isSafeInteger(page) || page < 1 || page > 2_147_483_647) {
            throw new BrowseFilterError('Invalid browse page');
        }
        const taxonomy = await catalogTaxonomy();
        if (filters.genre && filters.tag) {
            throw new BrowseFilterError('Choose either a genre or a tag');
        }
        for (const [filter, values, message] of [
            ['genre', taxonomy.genres, 'Unknown anime genre'],
            ['tag', taxonomy.tags, 'Unknown anime tag'],
            ['format', taxonomy.formats, 'Unknown anime format'],
            ['status', taxonomy.statuses, 'Unknown anime status'],
            ['source', taxonomy.sources, 'Unknown source material'],
            ['season', taxonomy.seasons, 'Unknown anime season'],
        ] as const) {
            const value = filters[filter];
            if (value && !values.includes(value)) {
                throw new BrowseFilterError(message);
            }
        }
        const { audio: _audio, ...sourceFilters } = filters;
        const queryKey = catalogSnapshotKey(sourceFilters, page);
        const [stored] = await db
            .select({
                animeIds: animeCatalogRefresh.animeIds,
                hasNextPage: animeCatalogRefresh.hasNextPage,
            })
            .from(animeCatalogRefresh)
            .where(eq(animeCatalogRefresh.queryKey, queryKey))
            .limit(1);
        let pageSnapshot = stored;
        if (!pageSnapshot) {
            const result = await source.browsePage({
                filters: sourceFilters,
                page,
                perPage: 42,
                forceRefresh: true,
            });
            pageSnapshot = await refreshCatalogPage(queryKey, result.anime, result.hasNextPage);
        }
        const catalog = await catalogPage(filters, page, pageSnapshot.animeIds);
        return {
            anime: await source.enrichAnimeCards(catalog.anime),
            hasNextPage: pageSnapshot.hasNextPage,
            page,
            stale: Boolean(stored),
            loadedAt: new Date().toISOString(),
        };
    }

    async function newAnimePage(page: number, filters: BrowseFilters) {
        if (!Number.isSafeInteger(page) || page < 1 || page > 2_147_483_647) {
            throw new BrowseFilterError('Invalid catalog page');
        }
        const now = new Date();
        const confirmed = await db
            .select({
                anilistId: animeEpisodeTarget.anilistId,
                episode: animeEpisodeTarget.targetEpisode,
                confirmedAt: animeEpisodeTarget.confirmedAt,
                airingAt: animeEpisodeTarget.airingAt,
            })
            .from(animeEpisodeTarget)
            .innerJoin(animeRelease, eq(animeRelease.anilistId, animeEpisodeTarget.anilistId))
            .where(
                and(
                    eq(animeEpisodeTarget.state, 'confirmed'),
                    lte(animeEpisodeTarget.airingAt, now),
                    gte(
                        animeEpisodeTarget.airingAt,
                        new Date(now.getTime() - 30 * 24 * 60 * 60 * 1_000)
                    ),
                    filters.status ? eq(animeRelease.status, filters.status) : undefined,
                    filters.format ? eq(animeRelease.format, filters.format) : undefined
                )
            )
            .orderBy(desc(animeEpisodeTarget.confirmedAt), desc(animeEpisodeTarget.targetEpisode))
            .limit(5_000);
        const latestByAnime = new Map<number, (typeof confirmed)[number]>();
        for (const entry of confirmed) {
            if (!latestByAnime.has(entry.anilistId)) {
                latestByAnime.set(entry.anilistId, entry);
            }
        }
        const latest = [...latestByAnime.values()];
        const episodeRows = latest.length
            ? await db
                  .select({
                      anilistId: animeEpisode.anilistId,
                      audio: animeEpisode.audio,
                  })
                  .from(animeEpisode)
                  .where(
                      inArray(
                          animeEpisode.anilistId,
                          latest.map(({ anilistId }) => anilistId)
                      )
                  )
            : [];
        const audioByAnime = audioModesByAnime(episodeRows);
        const eligible = latest.filter((entry) => {
            const audio = [...(audioByAnime.get(entry.anilistId) ?? [])];
            return !filters.audio || audio.includes(filters.audio);
        });
        const pageEntries = eligible.slice((page - 1) * 42, page * 42 + 1);
        const storedCards = new Map(
            (
                await storedReleaseCards(pageEntries.slice(0, 42).map(({ anilistId }) => anilistId))
            ).map((card) => [card.id, card])
        );
        const cards: AnimeCard[] = pageEntries.slice(0, 42).flatMap((entry) => {
            const card = storedCards.get(entry.anilistId);
            return card
                ? [
                      {
                          ...card,
                          audio: [...(audioByAnime.get(entry.anilistId) ?? [])],
                          releasedAt: (entry.confirmedAt ?? entry.airingAt).toISOString(),
                          episode: entry.episode,
                      },
                  ]
                : [];
        });
        return {
            anime: await source.enrichAnimeCards(cards),
            hasNextPage: pageEntries.length > 42,
            page,
            loadedAt: new Date().toISOString(),
        };
    }

    async function refreshCatalogSnapshots(now = new Date()) {
        const { season, year } = currentAnimeSeason(now);
        const homepageFilters: CatalogBrowseFilters = {
            query: '',
            genre: null,
            tag: null,
            format: null,
            status: null,
            source: null,
            season,
            year,
            country: null,
            safe: true,
            sort: 'popularity',
            order: 'desc',
        };
        const homepage = await source.browsePage({
            filters: homepageFilters,
            page: 1,
            perPage: 30,
            forceRefresh: true,
        });
        await refreshCatalogPage(
            catalogSnapshotKey(homepageFilters, 1),
            homepage.anime,
            homepage.hasNextPage
        );
        await refreshPopularCatalog(
            {
                ...homepageFilters,
                season: null,
                year: null,
            },
            source.browsePage,
            now
        );
        await simulcast.refreshCurrentSimulcast(now);
        await refreshCatalogTaxonomy(await source.browseTaxonomy(true));
    }

    return {
        catalogTaxonomy,
        getSearchResults: search,
        homePage: (userId: string, now?: Date) => homePage(source, userId, now),
        newAnimePage,
        popularAnimePage,
        refreshCatalogSnapshots,
        refreshCatalogTaxonomy: () => source.browseTaxonomy(true).then(refreshCatalogTaxonomy),
        refreshCurrentSimulcast: simulcast.refreshCurrentSimulcast,
        refreshReleaseCalendar: (now?: Date) => refreshReleaseCalendar(source.releaseCalendar, now),
        releaseCalendar,
        simulcast: simulcast.simulcast,
    };
}

export class BrowseFilterError extends Error {}
