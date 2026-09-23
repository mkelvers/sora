/** AniList dates are incomplete until all three parts are present. */
export function animeDate(
    value:
        | {
              year?: number | null;
              month?: number | null;
              day?: number | null;
          }
        | null
        | undefined
) {
    const { year, month, day } = value ?? {};

    return year && month && day
        ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
        : null;
}

export function dateTimestamp(value: string | null | undefined) {
    if (!value) {
        return null;
    }

    const timestamp = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(timestamp) ? timestamp : null;
}

/** Formats a date as the catalog's user-facing MM/DD/YYYY air-date string in UTC. */
export function formatAirDate(date: Date) {
    return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}/${date.getUTCFullYear()}`;
}

/** Formats a duration in minutes for compact episode and playback labels. */
export function formatDuration(minutes: number | null | undefined) {
    if (!minutes || minutes <= 0) {
        return '';
    }

    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    if (!hours) {
        return `${remainder}m`;
    }

    return remainder ? `${hours}h, ${remainder}m` : `${hours}h`;
}

export function mediaTitle(media: {
    id: number;
    title?: {
        english?: string | null;
        romaji?: string | null;
        native?: string | null;
    } | null;
}) {
    return (
        [media.title?.english, media.title?.romaji, media.title?.native].find((title) =>
            Boolean(title?.trim())
        ) ?? `Anime ${media.id}`
    );
}

export function animeTitles(anime: {
    title?: {
        english?: string | null;
        romaji?: string | null;
        native?: string | null;
    } | null;
    synonyms?: readonly (string | null)[] | null;
}) {
    return [
        anime.title?.english,
        anime.title?.romaji,
        anime.title?.native,
        ...(anime.synonyms ?? []),
    ].filter(
        (title, index, values): title is string =>
            Boolean(title?.trim()) && values.indexOf(title) === index
    );
}

/** Removes provider markup and appended source notes before text reaches cards. */
export function plainText(value: string | null | undefined) {
    if (!value) {
        return '';
    }

    return value
        .replace(/<br\s*\/?>/gi, ' ')
        .replace(/<[^>]+>/g, '')
        .replace(/\s*\(Source:[\s\S]*$/i, '')
        .replace(/\s*Note:[\s\S]*$/i, '')
        .replace(/\s+/g, ' ')
        .trim();
}
