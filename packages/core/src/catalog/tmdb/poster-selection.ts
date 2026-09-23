import type { AniListAnime } from '../anilist/anilist-types';
import { animeDate } from '../utils';
import type { TmdbResponse } from './client';
import { isSpecialRelease, releaseSequence } from './title';

type Season = Pick<
    NonNullable<TmdbResponse['seasons']>[number],
    'air_date' | 'episode_count' | 'poster_path' | 'season_number'
>;

interface ReleaseSeasonSelection {
    aggregate: boolean;
    season: Season;
}

export interface PosterCandidate {
    aspectRatio: number;
    filePath: string;
    height: number;
    language: string | null;
    voteAverage: number;
    voteCount: number;
    width: number;
}

export function selectReleaseSeason(
    anime: AniListAnime,
    seasons: Season[]
): ReleaseSeasonSelection | null {
    const expectedDate = animeDate(anime.startDate);
    const expectedYear = anime.startDate?.year ?? anime.seasonYear;
    const expectedSequence = releaseSequence(anime);
    const candidates = seasons.filter(({ season_number }) =>
        isSpecialRelease(anime) ? season_number === 0 : season_number > 0
    );
    const ranked = candidates
        .map((season) => {
            const year = Number(season.air_date?.slice(0, 4)) || null;
            const exactDate = Boolean(expectedDate && season.air_date === expectedDate);
            const countMatch = Boolean(anime.episodes && season.episode_count === anime.episodes);
            const sequenceMatch = Boolean(
                expectedSequence && season.season_number === expectedSequence
            );
            const yearMatch = Boolean(expectedYear && year === expectedYear);

            return {
                season,
                exactDate,
                countMatch,
                sequenceMatch,
                yearMatch,
                score:
                    Number(exactDate) * 1_000 +
                    Number(countMatch) * 200 +
                    Number(sequenceMatch) * 100 +
                    Number(yearMatch) * 50 -
                    (expectedYear && year ? Math.abs(expectedYear - year) * 10 : 0),
            };
        })
        .toSorted((left, right) => right.score - left.score);
    const [best, alternate] = ranked;
    // A season is selected only when independent release facts agree. The
    // single-season aggregate fallback is reserved for series with no competing
    // season, where choosing another season would be less defensible.
    const supported = Boolean(
        best &&
        (best.exactDate ||
            (best.countMatch && best.yearMatch) ||
            (best.sequenceMatch && (best.countMatch || best.yearMatch)))
    );
    const aggregate = Boolean(
        best && !supported && candidates.length === 1 && !isSpecialRelease(anime)
    );

    if (!best || (alternate && alternate.score === best.score) || (!supported && !aggregate)) {
        return null;
    }

    return {
        aggregate,
        season: best.season,
    };
}

function languageRank(language: string | null) {
    return language === 'en' ? 0 : language === null ? 1 : 2;
}

export function selectPoster(candidates: PosterCandidate[], unavailable = new Set<string>()) {
    return (
        candidates
            .filter(
                ({ aspectRatio, filePath, height, width }) =>
                    width > 0 &&
                    height > 0 &&
                    !unavailable.has(filePath) &&
                    Math.abs(aspectRatio - 2 / 3) < 0.08
            )
            .toSorted(
                (left, right) =>
                    Number(right.width >= 1_000) - Number(left.width >= 1_000) ||
                    languageRank(left.language) - languageRank(right.language) ||
                    right.voteAverage - left.voteAverage ||
                    right.voteCount - left.voteCount ||
                    right.width - left.width
            )[0] ?? null
    );
}
