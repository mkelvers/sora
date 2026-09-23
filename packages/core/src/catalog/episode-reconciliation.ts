import { canPreserveEpisodeMetadata, episodeMetadataRevision } from './episode-policy';
import { preferredEpisodeAirDate } from './episode-release';

export interface EpisodeMetadata {
    title: string | null;
    titleSource: 'tmdb' | 'machine' | null;
    imageUrl: string | null;
    runtime: number | null;
    airDate: string | null;
    overview: string | null;
    overviewSource: 'tmdb' | 'machine' | null;
}

export interface EpisodeMetadataRow {
    episodeId: string;
    number: number;
    metadataTitle: string | null;
    metadataTitleSource: 'tmdb' | 'machine' | null;
    imageUrl: string | null;
    runtimeMinutes: number | null;
    airDate: string | null;
    overview: string | null;
    overviewSource: 'tmdb' | 'machine' | null;
}

export function reconcileEpisodeMetadata(
    episodes: readonly EpisodeMetadataRow[],
    metadata: ReadonlyMap<string, EpisodeMetadata> | null,
    options: {
        /** Previously selected metadata provider mapping. */

        previousSourceId: number | null;
        /** Current mapping, or null when lookup has no usable provider. */
        currentSourceId: number | null;
        /** Revision attached to the previously stored metadata. */
        previousRevision: string | null;
        /** Confirmed schedule dates override weaker episode metadata dates. */
        confirmedAirDates?: ReadonlyMap<number, Date>;
    }
) {
    // Preserve old metadata only when it belongs to the same source and schema
    // revision. A failed fetch can pass null and retain valid prior values; a
    // successful response replaces only fields it actually supplies.
    const preserve =
        canPreserveEpisodeMetadata(options.previousSourceId, options.currentSourceId) &&
        (metadata === null || options.previousRevision === episodeMetadataRevision);

    return episodes.map((episode) => {
        const current = metadata?.get(episode.episodeId);
        const previous = preserve ? episode : null;
        const airDate = current?.airDate || previous?.airDate || null;

        return {
            episodeId: episode.episodeId,
            metadataTitle: current?.title ?? previous?.metadataTitle ?? null,
            metadataTitleSource: current?.titleSource ?? previous?.metadataTitleSource ?? null,
            imageUrl: current?.imageUrl ?? previous?.imageUrl ?? null,
            runtimeMinutes: current?.runtime ?? previous?.runtimeMinutes ?? null,
            airDate: preferredEpisodeAirDate(
                airDate,
                options.confirmedAirDates?.get(episode.number)
            ),
            overview: current?.overview ?? previous?.overview ?? null,
            overviewSource: current?.overviewSource ?? previous?.overviewSource ?? null,
        };
    });
}
