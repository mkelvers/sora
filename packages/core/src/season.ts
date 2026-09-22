export type AnimeSeason = 'WINTER' | 'SPRING' | 'SUMMER' | 'FALL';

const seasonOrder: AnimeSeason[] = ['WINTER', 'SPRING', 'SUMMER', 'FALL'];

/** A season and calendar year pair used to select a simulcast period. */
export interface AnimeSeasonSelection {
    season: AnimeSeason;
    year: number;
}

/** Earliest catalog year known for each season; missing seasons are omitted. */
export type AnimeSeasonStartYears = Partial<Record<AnimeSeason, number>>;

/** Parses a season name case-insensitively after trimming surrounding space. */
export function parseAnimeSeason(value: string | null | undefined): AnimeSeason | undefined {
    const season = value?.trim().toUpperCase();

    return seasonOrder.find((candidate) => candidate === season);
}

/** Returns the season containing `now`, using UTC calendar months and year. */
export function currentAnimeSeason(now = new Date()): AnimeSeasonSelection {
    return {
        season: seasonOrder[Math.floor(now.getUTCMonth() / 3)],
        year: now.getUTCFullYear(),
    };
}

/** Compares seasons chronologically; a negative result means `left` is earlier. */
export function compareAnimeSeasons(left: AnimeSeasonSelection, right: AnimeSeasonSelection) {
    return (
        left.year - right.year ||
        seasonOrder.indexOf(left.season) - seasonOrder.indexOf(right.season)
    );
}

/**
 * Lists seasons with known start years through `latest`, inclusive.
 *
 * Each season is included only for years at or after its first known start
 * year. An empty result means no valid start year was supplied.
 */
export function availableAnimeSeasons(starts: AnimeSeasonStartYears, latest: AnimeSeasonSelection) {
    const firstYear = Math.min(
        ...seasonOrder.flatMap((season) => {
            const year = starts[season];
            return year && year > 0 ? [year] : [];
        })
    );
    if (!Number.isSafeInteger(firstYear)) {
        return [];
    }

    const options: AnimeSeasonSelection[] = [];
    for (let year = firstYear; year <= latest.year; year++) {
        for (const season of seasonOrder) {
            const firstSeasonYear = starts[season];
            const option = {
                season,
                year,
            };
            if (
                firstSeasonYear &&
                year >= firstSeasonYear &&
                compareAnimeSeasons(option, latest) <= 0
            ) {
                options.push(option);
            }
        }
    }

    return options;
}
