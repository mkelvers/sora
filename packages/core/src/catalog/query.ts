import { and, arrayContains, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import type { BrowseFilters } from './browse-filters';
import { audioModesByAnime, type AudioMode } from '../audio';
import type { AnimeCard } from '../types';
import { db } from '@soraorg/database';
import {
    animeCatalog,
    animeCatalogRefresh,
    animeEpisode,
    animeEpisodeTarget,
    animeRelease,
} from '@soraorg/database/schema';
import { getBrowsePage, type AniListBrowseFilters } from './anilist/anilist-browse';
import { enrichAnimeCards } from './card-enrichment';
import {
    catalogSnapshotKey,
    catalogTaxonomy,
    refreshCatalogPage,
    storedReleaseCards,
} from './storage';

function hasAudio(mode: AudioMode) {
    return sql<boolean>`exists (
        select 1
        from ${animeEpisode}
        where ${animeEpisode.anilistId} = ${animeCatalog.anilistId}
          and cast(${mode} as episode_audio) = any(${animeEpisode.audio})
    )`;
}

function catalogConditions(filters: BrowseFilters) {
    return and(
        filters.query
            ? sql`${animeCatalog.searchText} ilike ${`%${filters.query.replace(/[\\%_]/g, '\\$&')}%`} escape '\\'`
            : undefined,
        filters.format === 'MOVIE'
            ? eq(animeCatalog.format, 'MOVIE')
            : inArray(animeCatalog.format, ['TV', 'ONA']),
        sql`${animeCatalog.popularity} >= 2000`,
        sql`(${animeCatalog.duration} is null or ${animeCatalog.duration} >= 15)`,
        eq(animeCatalog.discoveryRevision, 2),
        filters.safe ? eq(animeCatalog.isAdult, false) : undefined,
        filters.genre ? arrayContains(animeCatalog.genres, [filters.genre]) : undefined,
        filters.tag ? arrayContains(animeCatalog.tags, [filters.tag]) : undefined,
        filters.status ? eq(animeCatalog.status, filters.status) : undefined,
        filters.format && filters.format !== 'MOVIE'
            ? eq(animeCatalog.format, filters.format)
            : undefined,
        filters.source ? eq(animeCatalog.source, filters.source) : undefined,
        filters.season ? eq(animeCatalog.season, filters.season) : undefined,
        filters.year ? eq(animeCatalog.seasonYear, filters.year) : undefined,
        filters.country ? eq(animeCatalog.countryOfOrigin, filters.country) : undefined,
        filters.audio === 'dub' ? hasAudio('dub') : undefined,
        filters.audio === 'sub' ? hasAudio('sub') : undefined
    );
}

function catalogOrder(filters: BrowseFilters) {
    const popularityDescending = sql`${animeCatalog.popularity} desc nulls last`;
    const titleAscending = sql`${animeCatalog.title} asc`;

    if (filters.sort === 'score') {
        return [
            filters.order === 'asc'
                ? sql`${animeCatalog.averageScore} asc nulls last`
                : sql`${animeCatalog.averageScore} desc nulls last`,
            popularityDescending,
            titleAscending,
            asc(animeCatalog.anilistId),
        ];
    }

    return [
        filters.order === 'asc'
            ? sql`${animeCatalog.popularity} asc nulls last`
            : popularityDescending,
        titleAscending,
        asc(animeCatalog.anilistId),
    ];
}

async function catalogPage(filters: BrowseFilters, page: number, animeIds: number[] | null) {
    if (animeIds?.length === 0) {
        return {
            anime: [],
            hasNextPage: false,
        };
    }

    const rows = await db
        .select({
            id: animeCatalog.anilistId,
            title: animeCatalog.title,
            image: animeCatalog.imageUrl,
            score: animeCatalog.averageScore,
            genres: animeCatalog.genres,
            synopsis: animeCatalog.synopsis,
            hasSub: hasAudio('sub'),
            hasDub: hasAudio('dub'),
            hasRaw: hasAudio('raw'),
        })
        .from(animeCatalog)
        .where(
            and(
                catalogConditions(filters),
                animeIds ? inArray(animeCatalog.anilistId, animeIds) : undefined
            )
        )
        .orderBy(...catalogOrder(filters))
        .limit(43)
        .offset(animeIds ? 0 : (page - 1) * 42);

    const orderedRows = animeIds
        ? animeIds.flatMap((id) => {
              const row = rows.find((candidate) => candidate.id === id);
              return row ? [row] : [];
          })
        : rows;

    const anime: AnimeCard[] = orderedRows.slice(0, 42).map((row) => {
        const audio: AudioMode[] = [];
        if (row.hasSub) {
            audio.push('sub');
        }
        if (row.hasDub) {
            audio.push('dub');
        }
        if (row.hasRaw) {
            audio.push('raw');
        }
        return {
            id: row.id,
            title: row.title,
            image: row.image,
            audio,
            score: row.score ?? 0,
            genres: row.genres,
            synopsis: row.synopsis,
        };
    });

    return {
        anime,
        hasNextPage: orderedRows.length > 42,
    };
}

type ConfirmedEpisodeTarget = {
    anilistId: number;
    episode: number;
    confirmedAt: Date | null;
    airingAt: Date;
};

/** Uses a stored AniList page order, then applies local catalog and audio filters. */
export async function popularAnimePage(page: number, filters: BrowseFilters) {
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
        const result = await getBrowsePage({
            // The taxonomy check above validates these provider enum values.
            filters: sourceFilters as AniListBrowseFilters,
            page,
            perPage: 42,
            forceRefresh: true,
        });
        pageSnapshot = await refreshCatalogPage(queryKey, result.anime, result.hasNextPage);
    }
    const catalog = await catalogPage(filters, page, pageSnapshot.animeIds);
    return {
        anime: await enrichAnimeCards(catalog.anime),
        hasNextPage: pageSnapshot.hasNextPage,
        page,
        stale: Boolean(stored),
        loadedAt: new Date().toISOString(),
    };
}

/** Lists recently confirmed episode targets so new releases reflect actual availability. */
export async function newAnimePage(page: number, filters: BrowseFilters) {
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
    const latestByAnime = new Map<number, ConfirmedEpisodeTarget>();
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
        (await storedReleaseCards(pageEntries.slice(0, 42).map(({ anilistId }) => anilistId))).map(
            (card) => [card.id, card]
        )
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
        anime: await enrichAnimeCards(cards),
        hasNextPage: pageEntries.length > 42,
        page,
        loadedAt: new Date().toISOString(),
    };
}

class BrowseFilterError extends Error {}
