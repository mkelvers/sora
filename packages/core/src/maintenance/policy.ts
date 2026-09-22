// Invalid or too-small environment values fall back as a whole; a malformed
// setting must not silently disable claims, leases, or scheduler concurrency.
function schedulerSetting(name: string, fallback: number, minimum: number) {
    const value = Number(process.env[name]);
    return Number.isInteger(value) && value >= minimum ? value : fallback;
}

function schedulerSecondsSetting(name: string, fallback: number, minimum: number) {
    return schedulerSetting(name, fallback / 1_000, minimum / 1_000) * 1_000;
}

/**
 * Reads scheduler limits from the environment. Durations are returned in
 * milliseconds even though their environment variables are named in seconds.
 */
export function schedulerPolicy() {
    return {
        concurrency: schedulerSetting('ARC_SCHEDULER_CONCURRENCY', 1, 1),
        maxClaimedTargets: schedulerSetting('ARC_SCHEDULER_MAX_CLAIMED_TARGETS', 25, 1),
        claimingWindowMs: schedulerSecondsSetting(
            'ARC_SCHEDULER_CLAIMING_WINDOW_SECONDS',
            240 * 1_000,
            1_000
        ),
        leaseDurationMs: schedulerSecondsSetting(
            'ARC_SCHEDULER_LEASE_SECONDS',
            600 * 1_000,
            30_000
        ),
        leaseRenewalMs: schedulerSecondsSetting(
            'ARC_SCHEDULER_LEASE_RENEWAL_SECONDS',
            180 * 1_000,
            10_000
        ),
        fullReconciliationIntervalMs: schedulerSecondsSetting(
            'ARC_SCHEDULER_FULL_RECONCILIATION_SECONDS',
            3_600 * 1_000,
            60_000
        ),
        calendarRefreshIntervalMs: schedulerSecondsSetting(
            'ARC_SCHEDULER_CALENDAR_REFRESH_SECONDS',
            15 * 60 * 1_000,
            60_000
        ),
    } as const;
}

/** Lease timings for one scheduler process run, separate from target leases. */
export function schedulerRunLease() {
    return {
        durationMs: 2 * 60_000,
        renewalMs: 30_000,
    } as const;
}

export function firstEpisodeAttemptAt(airingAt: Date) {
    // Start looking before the announced time because upstream episode listings
    // can appear early; later retries handle feeds that publish late.
    return new Date(airingAt.getTime() - 30 * 60_000);
}

export function nextEpisodeAttemptAt(airingAt: Date, now: Date) {
    // Stop retrying two weeks after the scheduled airing to avoid retaining stale work.
    const deadline = airingAt.getTime() + 14 * 24 * 60 * 60_000;
    const nextAttemptAt = now.getTime() + 60_000;
    if (nextAttemptAt > deadline) {
        return null;
    }

    return new Date(nextAttemptAt);
}
