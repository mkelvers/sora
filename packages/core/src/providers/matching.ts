import type { ProviderEpisodeReference } from './types';

export function isSpecialEpisodeReference(episode: ProviderEpisodeReference) {
    return episode.number <= 0 || !Number.isInteger(episode.number);
}

function decodeHtmlEntities(value: string) {
    const entities: Record<string, string> = {
        amp: '&',
        apos: "'",
        gt: '>',
        lt: '<',
        nbsp: ' ',
        quot: '"',
    };

    return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/gi, (entity, decimal, hex, name) => {
        if (name) {
            const key = name.toLowerCase();
            return entities[key] ?? entity;
        }

        const codePoint = Number.parseInt(decimal ?? hex, decimal ? 10 : 16);
        return Number.isSafeInteger(codePoint) ? String.fromCodePoint(codePoint) : entity;
    });
}

export function normalizedProviderTitle(title: string) {
    let decodedTitle = title;
    for (let pass = 0; pass < 3; pass += 1) {
        const nextTitle = decodeHtmlEntities(decodedTitle);
        if (nextTitle === decodedTitle) {
            break;
        }
        decodedTitle = nextTitle;
    }

    return decodedTitle
        .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim()
        .toLocaleLowerCase('en');
}

export function episodeTitleKey(title: string) {
    return normalizedProviderTitle(title)
        .replace(/^episode \d+(?: \d+)?(?:\s+|$)/, '')
        .replace(/^(?:extra|special|ova|oad)\s+/, '')
        .replace(/^(?:a|an|the)\s+/, '')
        .trim();
}

/**
 * Scores title evidence for provider matching: exact normalized titles score 100,
 * strong partial or word overlap scores 60–75, and weak evidence scores below 15.
 * Callers use these bands to avoid replacing a numbered match with an ambiguous title match.
 */
export function episodeTitleScore(left: string, right: string) {
    const a = episodeTitleKey(left);
    const b = episodeTitleKey(right);

    if (!a || !b) {
        return 0;
    }

    if (a === b) {
        return 100;
    }

    if (Math.min(a.length, b.length) >= 5 && (a.includes(b) || b.includes(a))) {
        return 75;
    }
    const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
    if (shorter.length >= 3 && (longer.startsWith(shorter) || longer.endsWith(shorter))) {
        return 75;
    }

    const insignificant = new Set(['a', 'an', 'and', 'for', 'in', 'of', 'on', 'the', 'to']);
    const significantWords = (value: string) =>
        value
            .split(' ')
            .filter((word) => !insignificant.has(word))
            .map((word) => (word.length >= 5 ? word.replace(/s$/, '') : word));
    const leftWords = new Set(significantWords(a));
    const rightWords = new Set(significantWords(b));
    if (!leftWords.size || !rightWords.size) {
        return -30;
    }
    const shared = [...leftWords].filter((word) => rightWords.has(word)).length;
    const similarity = (2 * shared) / (leftWords.size + rightWords.size);

    if (similarity >= 0.75) {
        return 60;
    }
    if (similarity >= 0.5) {
        return 35;
    }
    if (similarity >= 0.3) {
        return 15;
    }

    return -30;
}

export function coversExpectedEpisodes(
    episodes: readonly { number: number }[],
    expected: number | null | undefined
) {
    if (!expected || expected <= 0) {
        return true;
    }

    const regular = new Set(
        episodes.flatMap(({ number }) =>
            Number.isInteger(number) && number > 0 && number <= expected ? [number] : []
        )
    );
    const specials = episodes.filter(({ number }) => number <= 0 || !Number.isInteger(number));
    const regularCount = regular.size;
    const completeRegularRelease = regularCount === expected;
    // Some catalogs count a single special in the total while numbering all
    // episodes sequentially, so the special may occupy a missing regular number.
    const completeSpecialInclusiveRelease =
        regularCount + specials.length === expected &&
        [...regular].every((number) => number <= regularCount);

    return completeRegularRelease || completeSpecialInclusiveRelease;
}

const releaseTitleStopWords = new Set([
    'a',
    'an',
    'as',
    'cour',
    'digression',
    'episode',
    'episodes',
    'full',
    'i',
    'in',
    'journal',
    'memories',
    'movie',
    'of',
    'oad',
    'ona',
    'ova',
    'part',
    'recap',
    'season',
    'special',
    'tales',
    'the',
    'to',
    'tv',
]);

function releaseTitleWords(title: string) {
    return new Set(
        normalizedProviderTitle(title)
            .split(' ')
            .filter(
                (word) =>
                    word.length > 1 &&
                    !/^\d+(?:st|nd|rd|th)?$/.test(word) &&
                    !releaseTitleStopWords.has(word)
            )
    );
}

function relatedReleaseTitle(left: string, right: string) {
    const leftWords = releaseTitleWords(left);
    const rightWords = releaseTitleWords(right);
    if (!leftWords.size || !rightWords.size) {
        return false;
    }

    const shared = [...leftWords].filter((word) => rightWords.has(word));
    const smaller = Math.min(leftWords.size, rightWords.size);

    return (
        (shared.length >= 2 && shared.length / smaller >= 0.5) ||
        (smaller === 1 && shared.length === 1 && shared[0].length >= 5)
    );
}

function releaseSequence(title: string) {
    const normalized = normalizedProviderTitle(title);
    const season =
        normalized.match(/\bseason\s+0*(\d+)\b/)?.[1] ??
        normalized.match(/\b0*(\d+)(?:st|nd|rd|th)\s+season\b/)?.[1] ??
        null;
    const part = normalized.match(/\b(?:cour|part)\s+0*(\d+)\b/)?.[1] ?? null;

    return {
        season,
        part,
    };
}

export function relatedCollectionTitle(left: string, right: string) {
    if (!relatedReleaseTitle(left, right)) {
        return false;
    }

    const leftSequence = releaseSequence(left);
    const rightSequence = releaseSequence(right);
    return (
        (!leftSequence.season ||
            !rightSequence.season ||
            leftSequence.season === rightSequence.season) &&
        (!leftSequence.part || !rightSequence.part || leftSequence.part === rightSequence.part)
    );
}
