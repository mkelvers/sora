import type { AudioMode } from '../audio';
import type { AniListAnime } from '../catalog/anilist/anilist-types';
import type { EpisodeSkipTimes } from '../player/skip-times';

export interface ProviderEpisode {
    id: string;
    number: number;
    title: string;
    audio: AudioMode[];
    supplemental?: boolean;
}

export interface ProviderEpisodeTitleReference {
    number: number;
    title?: string;
}

export interface ProviderEpisodeReference extends ProviderEpisodeTitleReference {
    id: string;
    release?: ProviderEpisodeTitleReference[];
    relatedReleases?: ProviderEpisodeTitleReference[][];
    specialIndex?: number;
    specialCount?: number;
}

export interface ProviderStream {
    provider: string;
    server: string;
    url: string;
    quality: string | null;
    subtitles: Array<{
        kind: 'full' | 'sdh' | 'forced';
        url: string;
    }>;
}

export type ProviderStreams = Partial<Record<AudioMode, ProviderStream[]>>;

export interface ProviderPlayback {
    streams: ProviderStreams;
    skipTimes: EpisodeSkipTimes | null;
}

export interface PlaybackProvider {
    name: string;
    getEpisodes(anime: AniListAnime): Promise<ProviderEpisode[]>;
    getStreams(
        anime: AniListAnime,
        episode: ProviderEpisodeReference,
        modes: AudioMode[]
    ): Promise<ProviderPlayback>;
}
