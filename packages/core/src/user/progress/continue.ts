interface Progress {
    episodeId: string;
    positionSeconds: number;
    completed: boolean;
}

export interface PlaybackProgressCandidate extends Progress {
    durationSeconds: number;
    lastWatchedAt: Date;
    eventAt: Date;
    updatedAt: Date;
    id: string;
}

/**
 * Chooses the checkpoint with the strongest playback signal: incomplete over
 * completed, then furthest progress, followed by recency and a stable id tie-break.
 */
export function selectPlaybackProgress<T extends PlaybackProgressCandidate>(progress: T[]) {
    return progress.reduce<T | null>((selected, candidate) => {
        if (!selected) return candidate;

        if (candidate.completed !== selected.completed) {
            return candidate.completed ? selected : candidate;
        }

        const candidateRatio = candidate.durationSeconds
            ? candidate.positionSeconds / candidate.durationSeconds
            : 0;
        const selectedRatio = selected.durationSeconds
            ? selected.positionSeconds / selected.durationSeconds
            : 0;
        if (candidateRatio !== selectedRatio) {
            return candidateRatio > selectedRatio ? candidate : selected;
        }

        const dates = [
            ['lastWatchedAt', candidate.lastWatchedAt, selected.lastWatchedAt],
            ['eventAt', candidate.eventAt, selected.eventAt],
            ['updatedAt', candidate.updatedAt, selected.updatedAt],
        ] as const;
        for (const [, candidateDate, selectedDate] of dates) {
            if (candidateDate.getTime() !== selectedDate.getTime()) {
                return candidateDate > selectedDate ? candidate : selected;
            }
        }

        return candidate.id > selected.id ? candidate : selected;
    }, null);
}

/** Completed checkpoints and checkpoints for another episode always resume at zero. */
export function resumePosition(progress: Progress | null, episodeId: string) {
    if (!progress || progress.completed || progress.episodeId !== episodeId) {
        return 0;
    }

    return progress.positionSeconds;
}
