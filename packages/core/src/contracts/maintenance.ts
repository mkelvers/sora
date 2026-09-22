import { z } from 'zod';

/** Discriminated payloads accepted when enqueueing administrative maintenance work. */
export const MaintenanceRequestSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('release_refresh'),
        anilistId: z.number().int().positive(),
        mode: z.enum(['full', 'schedule']).default('full'),
    }),
    z.object({
        kind: z.literal('mapping_rediscover'),
        anilistId: z.number().int().positive(),
        mappingKind: z.literal('metadata'),
        provider: z.literal('tmdb').optional(),
    }),
    z.object({
        kind: z.literal('mapping_override'),
        anilistId: z.number().int().positive(),
        override: z.object({
            kind: z.literal('metadata'),
            provider: z.literal('tmdb'),
            externalId: z.string().regex(/^[1-9][0-9]*$/),
            mediaType: z.enum(['movie', 'tv']),
        }),
    }),
    z.object({
        kind: z.literal('target_reactivate'),
        anilistId: z.number().int().positive(),
        targetEpisode: z.number().int().positive(),
    }),
    z.object({
        kind: z.literal('airing_reconcile'),
    }),
    z.object({
        kind: z.literal('interest_reconcile'),
    }),
    z.object({
        kind: z.literal('episode_backfill'),
        anilistId: z.number().int().positive(),
    }),
]);

export type MaintenanceRequest =
    | {
          kind: 'release_refresh';
          anilistId: number;
          mode: 'full' | 'schedule';
      }
    | {
          kind: 'mapping_rediscover';
          anilistId: number;
          mappingKind: 'metadata';
          provider?: 'tmdb';
      }
    | {
          kind: 'mapping_override';
          anilistId: number;
          override: {
              kind: 'metadata';
              provider: 'tmdb';
              externalId: string;
              mediaType: 'movie' | 'tv';
          };
      }
    | {
          kind: 'target_reactivate';
          anilistId: number;
          targetEpisode: number;
      }
    | {
          kind: 'airing_reconcile';
      }
    | {
          kind: 'interest_reconcile';
      }
    | {
          kind: 'episode_backfill';
          anilistId: number;
      };

export const MaintenanceTaskSchema = z.object({
    id: z.uuid(),
    kind: z.string(),
    state: z.enum(['pending', 'running', 'completed', 'failed']),
    attempts: z.number().int().nonnegative(),
    nextAttemptAt: z.iso.datetime(),
    lastError: z.string().nullable(),
    result: z.json().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
    completedAt: z.iso.datetime().nullable(),
});

export const MaintenanceHealthSchema = z.object({
    healthy: z.boolean(),
    reason: z.string().nullable(),
    active: z.boolean(),
    startedAt: z.iso.datetime().nullable(),
    completedAt: z.iso.datetime().nullable(),
    lastSuccessAt: z.iso.datetime().nullable(),
    lastFailureAt: z.iso.datetime().nullable(),
    lastFullReconciliationAt: z.iso.datetime().nullable(),
    nextFullReconciliationAt: z.iso.datetime().nullable(),
    lastCatalogRefreshAt: z.iso.datetime().nullable(),
    nextCatalogRefreshAt: z.iso.datetime().nullable(),
    durationMs: z.number().nullable(),
    stats: z.json().nullable(),
    targets: z.object({
        pending: z.number().int().nonnegative(),
        due: z.number().int().nonnegative(),
        leased: z.number().int().nonnegative(),
        confirmed: z.number().int().nonnegative(),
        failed: z.number().int().nonnegative(),
        retired: z.number().int().nonnegative(),
    }),
    maintenanceTasks: z.record(z.string(), z.number().int().nonnegative()),
    maintenanceOldestDueAgeMs: z.number().nonnegative().nullable(),
    anilist: z
        .object({
            blockedUntil: z.iso.datetime().nullable(),
            lastRequestAt: z.iso.datetime().nullable(),
            lastOperation: z.string().nullable(),
            lastStatus: z.number().int().nullable(),
            lastError: z.string().nullable(),
            requestCount: z.number().int().nonnegative(),
            successCount: z.number().int().nonnegative(),
            failureCount: z.number().int().nonnegative(),
        })
        .nullable(),
    oldestDueAgeMs: z.number().nullable(),
});
