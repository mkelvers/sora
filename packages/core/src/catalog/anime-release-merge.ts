import type { AniListAnime, AnimeMetadataField } from './anilist/anilist-types';

/** A provider's metadata snapshot and the time it was fetched. */
export interface AnimeReleaseSnapshot {
    provider: string;
    data: AniListAnime;
    sourceFetchedAt: Date;
}

type MetadataFieldSources = Partial<Record<AnimeMetadataField, string>>;

function nonBlankOr(primary: string | null | undefined, fallback: string | null | undefined) {
    return primary?.trim() ? primary : fallback?.trim() ? fallback : null;
}

function listOr<T>(primary: T[] | null | undefined, fallback: T[] | null | undefined) {
    return primary?.length ? primary : (fallback ?? null);
}

function providerOrder(left: AnimeReleaseSnapshot, right: AnimeReleaseSnapshot) {
    // AniList stays authoritative; among fallbacks, prefer the freshest snapshot.
    if (left.provider === 'anilist') return -1;
    if (right.provider === 'anilist') return 1;
    return right.sourceFetchedAt.getTime() - left.sourceFetchedAt.getTime();
}

function mergePair(
    primary: AniListAnime,
    fallback: AniListAnime,
    fallbackProvider: string,
    fieldSources: MetadataFieldSources
) {
    const merged: AniListAnime = {
        ...primary,
        idMal: primary.idMal ?? fallback.idMal ?? null,
        title:
            primary.title || fallback.title
                ? {
                      english: nonBlankOr(primary.title?.english, fallback.title?.english),
                      romaji: nonBlankOr(primary.title?.romaji, fallback.title?.romaji),
                      native: nonBlankOr(primary.title?.native, fallback.title?.native),
                  }
                : null,
        synonyms: listOr(primary.synonyms, fallback.synonyms),
        coverImage:
            primary.coverImage || fallback.coverImage
                ? {
                      extraLarge:
                          primary.coverImage?.extraLarge ?? fallback.coverImage?.extraLarge ?? null,
                      large: primary.coverImage?.large ?? fallback.coverImage?.large ?? null,
                  }
                : null,
        bannerImage: primary.bannerImage ?? fallback.bannerImage ?? null,
        description: primary.description ?? fallback.description ?? null,
        genres: listOr(primary.genres, fallback.genres),
        format: primary.format ?? fallback.format ?? null,
        status: primary.status ?? fallback.status ?? null,
        season: primary.season ?? fallback.season ?? null,
        seasonYear: primary.seasonYear ?? fallback.seasonYear ?? null,
        startDate: primary.startDate ?? fallback.startDate ?? null,
        endDate: primary.endDate ?? fallback.endDate ?? null,
        episodes: primary.episodes ?? fallback.episodes ?? null,
        duration: primary.duration ?? fallback.duration ?? null,
        // Airing timestamps are AniList-authoritative and are never invented by a fallback.
        nextAiringEpisode: primary.nextAiringEpisode,
        relations:
            primary.relations || fallback.relations
                ? { edges: listOr(primary.relations?.edges, fallback.relations?.edges) }
                : null,
        averageScore: primary.averageScore ?? fallback.averageScore ?? null,
        popularity: primary.popularity ?? fallback.popularity ?? null,
        favourites: primary.favourites ?? fallback.favourites ?? null,
        rankings: listOr(primary.rankings, fallback.rankings),
        tags: listOr(primary.tags, fallback.tags),
        studios:
            primary.studios || fallback.studios
                ? { nodes: listOr(primary.studios?.nodes, fallback.studios?.nodes) }
                : null,
        staff:
            primary.staff || fallback.staff
                ? { edges: listOr(primary.staff?.edges, fallback.staff?.edges) }
                : null,
        isAdult: primary.isAdult ?? fallback.isAdult,
        source: primary.source ?? fallback.source ?? null,
        countryOfOrigin: primary.countryOfOrigin ?? fallback.countryOfOrigin ?? null,
    };

    // Track provenance only when a fallback supplies data missing from the preferred source.
    if (primary.idMal == null && fallback.idMal != null) fieldSources.idMal ??= fallbackProvider;
    if (!primary.title && fallback.title) fieldSources.title ??= fallbackProvider;
    if (!primary.synonyms?.length && fallback.synonyms?.length)
        fieldSources.synonyms ??= fallbackProvider;
    if (!primary.coverImage && fallback.coverImage) fieldSources.coverImage ??= fallbackProvider;
    if (!primary.bannerImage && fallback.bannerImage) fieldSources.bannerImage ??= fallbackProvider;
    if (!primary.description && fallback.description) fieldSources.description ??= fallbackProvider;
    if (!primary.genres?.length && fallback.genres?.length)
        fieldSources.genres ??= fallbackProvider;
    if (!primary.format && fallback.format) fieldSources.format ??= fallbackProvider;
    if (!primary.status && fallback.status) fieldSources.status ??= fallbackProvider;
    if (!primary.season && fallback.season) fieldSources.season ??= fallbackProvider;
    if (primary.seasonYear == null && fallback.seasonYear != null)
        fieldSources.seasonYear ??= fallbackProvider;
    if (!primary.startDate && fallback.startDate) fieldSources.startDate ??= fallbackProvider;
    if (!primary.endDate && fallback.endDate) fieldSources.endDate ??= fallbackProvider;
    if (primary.episodes == null && fallback.episodes != null)
        fieldSources.episodes ??= fallbackProvider;
    if (primary.duration == null && fallback.duration != null)
        fieldSources.duration ??= fallbackProvider;
    if (!primary.relations?.edges?.length && fallback.relations?.edges?.length)
        fieldSources.relations ??= fallbackProvider;
    if (primary.isAdult == null && fallback.isAdult != null)
        fieldSources.isAdult ??= fallbackProvider;
    if (primary.averageScore == null && fallback.averageScore != null)
        fieldSources.averageScore ??= fallbackProvider;
    if (primary.popularity == null && fallback.popularity != null)
        fieldSources.popularity ??= fallbackProvider;
    if (primary.favourites == null && fallback.favourites != null)
        fieldSources.favourites ??= fallbackProvider;
    if (!primary.rankings?.length && fallback.rankings?.length)
        fieldSources.rankings ??= fallbackProvider;
    if (!primary.tags?.length && fallback.tags?.length) fieldSources.tags ??= fallbackProvider;
    if (!primary.studios?.nodes?.length && fallback.studios?.nodes?.length)
        fieldSources.studios ??= fallbackProvider;
    if (!primary.staff?.edges?.length && fallback.staff?.edges?.length)
        fieldSources.staff ??= fallbackProvider;
    if (primary.source == null && fallback.source != null) fieldSources.source ??= fallbackProvider;
    if (primary.countryOfOrigin == null && fallback.countryOfOrigin != null)
        fieldSources.countryOfOrigin ??= fallbackProvider;

    return merged;
}

/**
 * Combines provider snapshots, keeping AniList authoritative when present and
 * recording which fallback supplied each missing metadata field.
 */
export function mergeAnimeReleaseSnapshots(snapshots: AnimeReleaseSnapshot[]) {
    const ordered = [...snapshots].sort(providerOrder);
    const [authoritative, ...fallbacks] = ordered;
    if (!authoritative) return null;

    const fieldSources = {
        ...authoritative.data.metadataFieldSources,
    } satisfies MetadataFieldSources;
    let merged = authoritative.data;
    for (const fallback of fallbacks) {
        merged = mergePair(merged, fallback.data, fallback.provider, fieldSources);
    }

    if (authoritative.provider === 'anilist') {
        delete merged.metadataSource;
        delete merged.metadataSourceId;
    } else {
        merged.metadataSource = authoritative.provider;
    }

    if (Object.keys(fieldSources).length) {
        merged.metadataFieldSources = fieldSources;
    } else {
        delete merged.metadataFieldSources;
    }

    return merged;
}

export function relationSnapshotProvider(snapshots: AnimeReleaseSnapshot[]) {
    const ordered = [...snapshots].sort(providerOrder);
    return ordered.find(({ data }) => (data.relations?.edges?.length ?? 0) > 0)?.provider ?? null;
}
