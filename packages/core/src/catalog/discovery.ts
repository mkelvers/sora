import type { MediaFormat } from './anilist/graphql/graphql.generated';
import type { BrowseCatalogEntry } from './browse-types';

type DiscoveryMedia = Pick<BrowseCatalogEntry, 'format' | 'popularity' | 'duration'>;

export function isDiscoverableAnime(
    media: DiscoveryMedia,
    formats: readonly MediaFormat[] = ['TV', 'ONA']
) {
    return (
        media.format !== null &&
        formats.includes(media.format) &&
        media.popularity !== null &&
        media.popularity >= 2_000 &&
        (media.duration === null || media.duration >= 15)
    );
}
