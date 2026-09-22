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
