import type {
    BrowseAnimePageQuery,
    BrowseAnimeTaxonomyQuery,
    MediaFormat,
    MediaSeason,
    MediaSource,
    MediaStatus,
} from './anilist/graphql/graphql.generated';
import { isNotNullish } from '../utils';
import { z } from 'zod';
import { animeTitles, mediaTitle, plainText } from './utils';
import { isDiscoverableAnime } from './discovery';

export interface BrowseCatalogEntry {
    metadataSource?: string;
    anilistId: number;
    title: string;
    searchText: string;
    imageUrl: string;
    synopsis: string;
    genres: string[];
    tags: string[];
    format: MediaFormat | null;
    status: MediaStatus | null;
    source: MediaSource | null;
    season: MediaSeason | null;
    seasonYear: number | null;
    countryOfOrigin: string | null;
    isAdult: boolean;
    popularity: number | null;
    duration: number | null;
    averageScore: number | null;
}

export interface BrowseSourceTaxonomy {
    genres: string[];
    tags: string[];
    formats: string[];
    statuses: string[];
    sources: string[];
    seasons: string[];
}

const countryOfOriginSchema = z.string().nullable().optional();

export function transformBrowseEntries(
    mediaEntries: NonNullable<NonNullable<BrowseAnimePageQuery['Page']>['media']>,
    formats: readonly MediaFormat[] = ['TV', 'ONA']
): BrowseCatalogEntry[] {
    return (mediaEntries?.filter(isNotNullish) ?? []).flatMap((media) => {
        if (!isDiscoverableAnime(media, formats)) {
            return [];
        }

        const imageUrl = media.coverImage?.extraLarge ?? media.coverImage?.large;
        if (!imageUrl) {
            return [];
        }

        const title = mediaTitle(media);
        const searchText = [title, ...animeTitles(media)]
            .map((value) => value.trim())
            .filter(
                (value, index, values): value is string =>
                    Boolean(value) && values.indexOf(value) === index
            )
            .join('\n');

        return [
            {
                metadataSource: z
                    .object({ metadataSource: z.string().min(1).optional() })
                    .parse(media).metadataSource,
                anilistId: media.id,
                title,
                searchText,
                imageUrl,
                synopsis: plainText(media.description),
                genres: media.genres?.filter((genre): genre is string => genre !== null) ?? [],
                tags: media.tags?.filter(isNotNullish).map(({ name }) => name) ?? [],
                format: media.format,
                status: media.status,
                source: media.source,
                season: media.season,
                seasonYear: media.seasonYear,
                countryOfOrigin:
                    countryOfOriginSchema.safeParse(media.countryOfOrigin).data ?? null,
                isAdult: media.isAdult !== false,
                popularity: media.popularity,
                duration: media.duration,
                averageScore: media.averageScore,
            } satisfies BrowseCatalogEntry,
        ];
    });
}

export function transformBrowseTaxonomy(response: BrowseAnimeTaxonomyQuery): BrowseSourceTaxonomy {
    return {
        genres: [
            ...new Set(
                response.GenreCollection?.filter((genre): genre is string => genre !== null) ?? []
            ),
        ].sort((left, right) => left.localeCompare(right, 'en')),
        tags: [
            ...new Set(
                (response.tags?.filter(isNotNullish) ?? [])
                    .filter(({ isAdult }) => isAdult === false)
                    .map(({ name }) => name)
            ),
        ].sort((left, right) => left.localeCompare(right, 'en')),
        formats: response.formats?.enumValues?.filter(isNotNullish).map(({ name }) => name) ?? [],
        statuses: response.statuses?.enumValues?.filter(isNotNullish).map(({ name }) => name) ?? [],
        sources: response.sources?.enumValues?.filter(isNotNullish).map(({ name }) => name) ?? [],
        seasons: response.seasons?.enumValues?.filter(isNotNullish).map(({ name }) => name) ?? [],
    };
}
