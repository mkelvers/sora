import { eq, isNotNull } from 'drizzle-orm';
import { db } from '@soraorg/database';
import { animeFranchise, animeRelease } from '@soraorg/database/schema';
import { getAnimeRelease } from '../catalog/anilist/anilist-release';
import { getArtwork } from '../catalog/tmdb/artwork';
import {
    getBrowsePage,
    getBrowseTaxonomy,
    type AniListBrowseFilters,
} from '../catalog/anilist/anilist-browse';
import { catalogSnapshotKey, refreshCatalogPage, refreshCatalogTaxonomy } from '../catalog/storage';
import { refreshPopularCatalog } from '../catalog/refresh';
import { refreshCurrentSimulcast } from '../catalog/simulcast';
import { currentAnimeSeason } from '../season';
import { refreshHomeHeroCandidates } from '../catalog/anilist/anilist-hero';
import { refreshFranchiseOrder } from '../catalog/franchise';
import { ensureEpisodeInventoryBackfill } from '../catalog/episode-sync';
import { findMapping } from '../catalog/tmdb/mapping-store';
import { rediscoverMapping } from './mappings';
import type { AniListAnime } from '../catalog/anilist/anilist-types';

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

/** Refreshes scheduled catalog pages and taxonomy, then best-effort hero enrichment. */
export async function refreshCatalogSnapshots(now = new Date()) {
    const { season, year } = currentAnimeSeason(now);
    const homepageFilters: AniListBrowseFilters = {
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
    const homepage = await getBrowsePage({
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
        now
    );
    await refreshCurrentSimulcast(now);
    await refreshCatalogTaxonomy(await getBrowseTaxonomy(true));
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
