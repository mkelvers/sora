import { expect, test } from 'bun:test';

import {
    aniKotoMediaCandidates,
    isAniKotoDisguisedSegmentHost,
    normalizeAniKotoMediaUrl,
    unwrapAniKotoDisguisedSegment,
} from './anikoto-media';

test('media URLs stay on the allowlist and normalize known shards', () => {
    expect(normalizeAniKotoMediaUrl(new URL('https://s3.shiora.site/video.m3u8'))?.hostname).toBe(
        's3.akirax.buzz'
    );
    expect(normalizeAniKotoMediaUrl(new URL('https://example.com/video.m3u8'))).toBeNull();
});

test('media candidates include the provider mirror for imgnex streams', () => {
    const candidates = aniKotoMediaCandidates(new URL('https://cdn.imgnex.top/anime/video.m3u8'));
    expect(candidates.map(({ hostname }) => hostname)).toContain('megap.akirax.buzz');
});

test('disguised segment data starts after its image prefix', () => {
    const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xd9, 1, 2, 3]);
    expect(isAniKotoDisguisedSegmentHost('s1.akirax.buzz')).toBe(true);
    expect([...unwrapAniKotoDisguisedSegment(bytes)]).toEqual([1, 2, 3]);
});
