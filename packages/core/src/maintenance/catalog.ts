import { eq, isNotNull } from 'drizzle-orm';
import { db } from '@soraorg/database';
import { animeFranchise, animeRelease } from '@soraorg/database/schema';
import {
    SearchAnimePageDocument,
    ReleaseCalendarPageDocument,
} from '../catalog/anilist/graphql/graphql.generated';
import type { AnimeCard, AnimeCardPage } from '../types';
import type { AnimeSearchResult } from '../search';
import type { BrowseSourceTaxonomy } from '../catalog/browse-transform';
import type { HomeHero } from '../catalog/source';
import type { ReleaseCalendarEntry } from '../catalog/release-calendar-parser';
import { animeTitles, mediaTitle, plainText } from '../catalog/anilist/anilist-text';
import { getAnimeRelease, storedAnimeRelease } from '../catalog/anilist/anilist-release';
import { isDiscoverableAnime } from '../catalog/discovery';
import {
    getBrowsePage,
    getBrowseTaxonomy,
    type AniListBrowseFilters,
} from '../catalog/anilist/anilist-browse';
import { getEpisodes } from '../providers/episode-inventory';
import { request } from '../catalog/anilist/anilist-client';
import { parseReleaseCalendarPage } from '../catalog/release-calendar-parser';
import { getAniKotoSimulcastPage } from '../providers/anikoto';
import { enrichAnimeCards } from '../catalog/card-enrichment';
import { withAnimeSearchMetadata } from '../catalog/search-enrichment';
import { getArtwork } from '../catalog/tmdb/artwork';
import { resolveHeroSynopsis } from '../catalog/synopsis';
import { getContinueWatchingCards } from '../user/progress/store';
import { createCatalogApplication } from '../catalog/application';
import { refreshHomeHeroCandidates } from '../catalog/anilist/anilist-hero';
import { refreshFranchiseOrder } from '../catalog/franchise';
import { ensureEpisodeInventoryBackfill } from '../catalog/episode-sync';
import { findMapping } from '../catalog/tmdb/mapping-store';
import { rediscoverMapping } from './mappings';
import type { AniListAnime } from '../catalog/anilist/anilist-types';

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

export const catalogApplication = createCatalogApplication({
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
});

async function refreshKnownFranchises(now: Date) {
    const rows = await db
        .select({
            malId: animeRelease.malId,
            fetchedAt: animeFranchise.fetchedAt,
        })
        .from(animeRelease)
        .leftJoin(animeFranchise, eq(animeFranchise.malId, animeRelease.malId))
        .where(isNotNull(animeRelease.malId))
        .groupBy(animeRelease.malId, animeFranchise.fetchedAt);
    const malIds = rows.flatMap(({ malId, fetchedAt }) =>
        malId !== null &&
        (!fetchedAt || now.getTime() - fetchedAt.getTime() >= 7 * 24 * 60 * 60 * 1_000)
            ? [malId]
            : []
    );
    const failures: unknown[] = [];
    let completed = 0;
    for (const malId of malIds) {
        try {
            await refreshFranchiseOrder(malId, { force: true });
            completed += 1;
        } catch (cause) {
            failures.push(cause);
        }
    }
    if (failures.length) {
        throw new AggregateError(failures, 'One or more franchise refreshes failed');
    }

    return {
        attempted: malIds.length,
        completed,
        failed: 0,
    };
}

async function rediscoverRelatedMappings(release: AniListAnime) {
    const relatedIds = (release.relations?.edges ?? []).flatMap((edge) =>
        edge?.node?.type === 'ANIME' &&
        (edge.relationType === 'PREQUEL' || edge.relationType === 'SEQUEL')
            ? [edge.node.id]
            : []
    );

    for (const relatedId of relatedIds) {
        if (await findMapping(relatedId)) {
            continue;
        }

        try {
            await getAnimeRelease(relatedId);
            await rediscoverMapping(relatedId);
        } catch {}
    }
}

export async function refreshCatalogSnapshots(now = new Date()) {
    await catalogApplication.refreshCatalogSnapshots(now);
    const heroCandidates = await refreshHomeHeroCandidates(now);
    for (const { anilistId } of heroCandidates) {
        try {
            const release = await getAnimeRelease(anilistId);
            await ensureEpisodeInventoryBackfill(anilistId);
            await rediscoverRelatedMappings(release);
            if (!(await findMapping(anilistId))) {
                await rediscoverMapping(anilistId);
            }
            await getArtwork(release, { fetchMissing: true });
        } catch {}
    }
    await refreshKnownFranchises(now);
}

export const refreshReleaseCalendar = catalogApplication.refreshReleaseCalendar;
