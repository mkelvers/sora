import type { AiringAnime } from '../catalog/airing';

export function airingTargetSchedules(snapshot: AiringAnime[]) {
    return snapshot.flatMap((release) => {
        const schedules: { anilistId: number; episode: number; airingAt: Date }[] = [];
        if (release.latestAiredEpisode && release.latestAiredAt) {
            schedules.push({
                anilistId: release.id,
                episode: release.latestAiredEpisode,
                airingAt: new Date(release.latestAiredAt * 1_000),
            });
        }
        if (release.nextAiringEpisode && release.nextAiringAt) {
            schedules.push({
                anilistId: release.id,
                episode: release.nextAiringEpisode,
                airingAt: new Date(release.nextAiringAt * 1_000),
            });
        }
        return schedules;
    });
}
