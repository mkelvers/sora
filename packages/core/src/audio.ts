export type AudioMode = 'sub' | 'dub' | 'raw';

export function audioModesByAnime(rows: Array<{ anilistId: number; audio: AudioMode[] }>) {
    const modes = new Map<number, Set<AudioMode>>();
    for (const row of rows) {
        const animeModes = modes.get(row.anilistId) ?? new Set<AudioMode>();
        row.audio.forEach((mode) => animeModes.add(mode));
        modes.set(row.anilistId, animeModes);
    }
    return modes;
}
