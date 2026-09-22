/** Audio track categories used to group episodes and filter playback options. */
export type AudioMode = 'sub' | 'dub' | 'raw';

/**
 * Combines episode audio modes by AniList ID.
 *
 * A set prevents duplicate modes when several episodes have the same audio
 * track, while preserving the first-seen order of anime IDs and modes.
 */
export function audioModesByAnime(
    rows: {
        anilistId: number;
        audio: AudioMode[];
    }[]
) {
    const modes = new Map<number, Set<AudioMode>>();
    for (const row of rows) {
        const animeModes = modes.get(row.anilistId) ?? new Set<AudioMode>();
        row.audio.forEach((mode) => animeModes.add(mode));
        modes.set(row.anilistId, animeModes);
    }
    return modes;
}
