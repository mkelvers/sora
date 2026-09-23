import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';

import { db } from '@soraorg/database';
import { animeEpisode, animeEpisodeSync } from '@soraorg/database/schema';
import { episodeMetadataRefreshRequired } from './episode-policy';

export async function needsEpisodeMetadataRefresh(anilistId: number, metadataExternalIdId: number) {
    const [syncRows, episodeRows] = await Promise.all([
        db
            .select({
                metadataExternalIdId: animeEpisodeSync.metadataExternalIdId,
                metadataRevision: animeEpisodeSync.metadataRevision,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anilistId))
            .limit(1),
        db
            .select({
                image: animeEpisode.imageUrl,
                title: animeEpisode.metadataTitle,
                overview: animeEpisode.overview,
            })
            .from(animeEpisode)
            .where(eq(animeEpisode.anilistId, anilistId)),
    ]);

    return episodeMetadataRefreshRequired(
        episodeRows.map(({ image, title, overview }) => ({
            image,
            title: title ?? '',
            overview: overview ?? '',
        })),
        syncRows[0] ?? null,
        metadataExternalIdId
    );
}

export async function getStoredAiringSchedule(anilistId: number) {
    const [rows, confirmed] = await Promise.all([
        db
            .select({
                airingAt: animeEpisodeSync.nextAiringAt,
                episode: animeEpisodeSync.nextAiringEpisode,
            })
            .from(animeEpisodeSync)
            .where(eq(animeEpisodeSync.anilistId, anilistId))
            .limit(1),
        db
            .select({ episodeId: animeEpisode.episodeId })
            .from(animeEpisode)
            .innerJoin(animeEpisodeSync, eq(animeEpisodeSync.anilistId, animeEpisode.anilistId))
            .where(
                and(
                    eq(animeEpisode.anilistId, anilistId),
                    eq(animeEpisode.number, animeEpisodeSync.nextAiringEpisode)
                )
            )
            .limit(1),
    ]);
    const schedule = rows[0];

    if (!schedule) {
        return undefined;
    }
    if (!schedule.airingAt || !schedule.episode || confirmed.length) {
        return null;
    }

    return {
        airingAt: Math.floor(schedule.airingAt.getTime() / 1_000),
        episode: schedule.episode,
    };
}

export async function getEpisodeRevision(anilistId: number) {
    const [state] = await db
        .select({
            sourceRevision: animeEpisodeSync.sourceRevision,
            mediaStatus: animeEpisodeSync.mediaStatus,
            nextAiringAt: animeEpisodeSync.nextAiringAt,
            nextAiringEpisode: animeEpisodeSync.nextAiringEpisode,
            lastSuccessAt: animeEpisodeSync.lastSuccessAt,
        })
        .from(animeEpisodeSync)
        .where(eq(animeEpisodeSync.anilistId, anilistId))
        .limit(1);
    return state ? episodeRevision(state) : null;
}

export function episodeRevision(state: {
    sourceRevision: string | null;
    mediaStatus: string | null;
    nextAiringAt: Date | null;
    nextAiringEpisode: number | null;
    lastSuccessAt: Date | null;
}) {
    return createHash('sha256')
        .update(
            JSON.stringify({
                sourceRevision: state.sourceRevision,
                mediaStatus: state.mediaStatus,
                nextAiringAt: state.nextAiringAt?.toISOString() ?? null,
                nextAiringEpisode: state.nextAiringEpisode,
                lastSuccessAt: state.lastSuccessAt?.toISOString() ?? null,
            })
        )
        .digest('hex');
}
