import { eq } from 'drizzle-orm';

import type { AnimeCard } from '../types';
import { db } from '@soraorg/database';
import { animeSynopsis } from '@soraorg/database/schema';
import { getAnimeRelease, storedAnimeRelease } from './anilist/anilist-release';
import { mediaTitle, plainText } from './utils';
import type { AniListAnime } from './anilist/anilist-types';
import { NoConfidentTmdbMappingError } from './tmdb/mapping';
import { getTmdbSynopsis } from './tmdb/synopsis';

/** A season-only description needs the story text from an earlier release. */
function isSeasonPlaceholderSynopsis(value: string) {
    return /^(?:(?:the\s+)?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d+(?:st|nd|rd|th))\s+season|season\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|\d+(?:st|nd|rd|th)))\s+of\b/i.test(
        value.trim()
    );
}

/** Short hero text for a sequel can use its first release as context. */
function isSeasonReleaseTitle(value: string) {
    return /\b(?:season\s+(?:\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)|(?:\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)(?:st|nd|rd|th)?\s+season)\b/i.test(
        value
    );
}

function synopsisSentences(value: string) {
    const text = value.replace(/\s+\*(?:This includes|Includes):?[\s\S]*$/i, '').trim();
    const sentences: string[] = [];
    for (const part of text.split(/(?<=[.!?])\s+(?=[A-Z])/)) {
        const previous = sentences.at(-1);
        if (previous && /\b[A-Z]\.$/.test(previous)) {
            sentences[sentences.length - 1] = `${previous} ${part}`;
        } else {
            sentences.push(part);
        }
    }

    return sentences;
}

function conciseHeroSynopsis(value: string) {
    const sentences = synopsisSentences(value);
    const summary = sentences.slice(0, 2).join(' ');
    if (summary.length <= 320) {
        return summary;
    }

    const fragment = summary.slice(0, 320);
    const sentenceEnd = [...fragment.matchAll(/[.!?](?=\s|$)/g)].at(-1);
    if (sentenceEnd && sentenceEnd.index !== undefined && sentenceEnd.index >= 180) {
        return fragment.slice(0, sentenceEnd.index + 1);
    }

    const wordEnd = fragment.lastIndexOf(' ');
    return `${fragment.slice(0, wordEnd > 0 ? wordEnd : 320).trimEnd()}…`;
}

function informativeHeroSynopsis(preferred: string, fallback: string) {
    const minimumLength = 160;
    const preferredSentences = synopsisSentences(preferred);
    const preferredSummary = conciseHeroSynopsis(preferred);
    const fallbackSummary = conciseHeroSynopsis(fallback);

    // Do not let a technically valid one-line premise displace a fuller story summary.
    if (
        preferredSummary &&
        preferredSummary.length >= minimumLength &&
        preferredSummary.length * 3 >= fallback.trim().length * 2
    ) {
        return preferredSummary;
    }

    if (
        preferredSentences.length === 1 &&
        preferredSummary.length < minimumLength &&
        fallbackSummary.length >= minimumLength
    ) {
        return fallbackSummary;
    }

    const fallbackSentences = synopsisSentences(fallback);
    const consequence = fallbackSentences.length > 1 ? fallbackSentences.at(-1) : null;
    const enriched = consequence ? `${preferredSummary} ${consequence}` : '';

    return enriched && enriched.length <= 320 ? enriched : fallbackSummary || preferredSummary;
}

function releaseDate(anime: AniListAnime) {
    const year = anime.startDate?.year;
    if (!year) {
        return Number.MAX_SAFE_INTEGER;
    }

    return year * 10_000 + (anime.startDate?.month ?? 0) * 100 + (anime.startDate?.day ?? 0);
}

function earliestRelease(anime: AniListAnime[]) {
    return anime.toSorted(
        (left, right) => releaseDate(left) - releaseDate(right) || left.id - right.id
    )[0];
}

async function firstRelease(anime: AniListAnime, refresh = false) {
    const visited = new Set<number>();
    let current = anime;

    for (let depth = 0; depth < 12; depth += 1) {
        visited.add(current.id);
        const ids = (current.relations?.edges ?? []).flatMap((edge) =>
            edge?.relationType === 'PREQUEL' &&
            edge.node?.type === 'ANIME' &&
            !visited.has(edge.node.id)
                ? [edge.node.id]
                : []
        );
        if (!ids.length) {
            return current;
        }

        const prequels = await Promise.all(
            ids.map((id) => (refresh ? getAnimeRelease(id) : storedAnimeRelease(id)))
        );
        const available = prequels.filter((prequel): prequel is AniListAnime => prequel !== null);
        if (available.length !== prequels.length) {
            return current;
        }
        const earliest = earliestRelease(available);
        if (!earliest) {
            return current;
        }

        current = earliest;
    }

    return current;
}

async function refreshSynopsis(anime: AniListAnime, source: AniListAnime) {
    try {
        const replacement = await getTmdbSynopsis(source);
        const synopsis = replacement.synopsis?.trim() ?? '';
        replacement.synopsis = synopsis && !isSeasonPlaceholderSynopsis(synopsis) ? synopsis : null;
        await db
            .insert(animeSynopsis)
            .values({
                anilistId: anime.id,
                ...replacement,
                fetchedAt: new Date(),
            })
            .onConflictDoUpdate({
                target: animeSynopsis.anilistId,
                set: {
                    ...replacement,
                    fetchedAt: new Date(),
                },
            });

        return replacement.synopsis;
    } catch (cause) {
        if (cause instanceof NoConfidentTmdbMappingError) {
            await db
                .insert(animeSynopsis)
                .values({
                    anilistId: anime.id,
                    synopsis: null,
                    sourceAnilistId: source.id,
                    fetchedAt: new Date(),
                })
                .onConflictDoUpdate({
                    target: animeSynopsis.anilistId,
                    set: {
                        synopsis: null,
                        sourceAnilistId: source.id,
                        tmdbExternalIdId: null,
                        fetchedAt: new Date(),
                    },
                });
            return null;
        }

        throw cause;
    }
}

async function resolvedTmdbSynopsis(
    anime: AniListAnime,
    source: AniListAnime,
    options: { refresh?: boolean } = {}
) {
    let stored:
        | {
              synopsis: string | null;
              sourceAnilistId: number | null;
              fetchedAt: Date;
          }
        | undefined;
    try {
        [stored] = await db
            .select({
                synopsis: animeSynopsis.synopsis,
                sourceAnilistId: animeSynopsis.sourceAnilistId,
                fetchedAt: animeSynopsis.fetchedAt,
            })
            .from(animeSynopsis)
            .where(eq(animeSynopsis.anilistId, anime.id))
            .limit(1);
    } catch {}
    if (
        stored?.sourceAnilistId === source.id &&
        (anime.status === 'FINISHED' ||
            Date.now() - stored.fetchedAt.getTime() < 30 * 24 * 60 * 60 * 1_000)
    ) {
        return stored.synopsis;
    }

    if (!options.refresh) {
        return stored?.sourceAnilistId === source.id ? stored.synopsis : null;
    }

    try {
        return await refreshSynopsis(anime, source);
    } catch {
        if (stored?.sourceAnilistId === source.id) {
            return stored.synopsis;
        }

        return null;
    }
}

export async function resolveAnimeSynopsis(
    anime: AniListAnime,
    options: { refresh?: boolean } = {}
) {
    const original = plainText(anime.description);
    if (!isSeasonPlaceholderSynopsis(original)) {
        return original;
    }

    return (
        (await resolvedTmdbSynopsis(anime, await firstRelease(anime, options.refresh), options)) ??
        original
    );
}

export async function resolveHeroSynopsis(anime: AniListAnime) {
    const original = plainText(anime.description);
    const minimumHeroSynopsisLength = 160;
    const needsEarlierRelease =
        isSeasonPlaceholderSynopsis(original) ||
        (original.length < minimumHeroSynopsisLength && isSeasonReleaseTitle(mediaTitle(anime)));
    const source = needsEarlierRelease ? await firstRelease(anime, true) : anime;
    const replacement = await resolvedTmdbSynopsis(anime, source);
    return informativeHeroSynopsis(replacement ?? '', plainText(source.description) || original);
}

export async function withAnimeCardSynopses<T extends AnimeCard>(cards: T[]) {
    const enriched: T[] = [];

    for (let offset = 0; offset < cards.length; offset += 4) {
        enriched.push(
            ...(await Promise.all(
                cards.slice(offset, offset + 4).map(async (card) => {
                    if (!isSeasonPlaceholderSynopsis(card.synopsis)) {
                        return card;
                    }

                    try {
                        const anime = await getAnimeRelease(card.id);
                        return {
                            ...card,
                            synopsis: await resolveAnimeSynopsis(anime),
                        };
                    } catch {
                        return card;
                    }
                })
            ))
        );
    }

    return enriched;
}
