import { expect, test } from 'bun:test';

import { toAnimeDetails } from '../details';
import { parseStoredAnimeDetails } from './anilist-types';

const storedDetails = {
    id: 42,
    title: {
        english: 'Example',
        romaji: null,
        native: null,
    },
    bannerImage: null,
    description: null,
    genres: null,
    format: 'TV',
    status: 'FINISHED',
    season: null,
    seasonYear: null,
    averageScore: null,
    popularity: null,
    favourites: null,
    nextAiringEpisode: null,
    rankings: null,
    tags: null,
    studios: null,
    staff: null,
};

test('stored details still render when older snapshots lack full provider fields', () => {
    const parsed = parseStoredAnimeDetails(storedDetails);
    if (!parsed) {
        throw new Error('Expected stored details to parse');
    }
    expect(toAnimeDetails(parsed).title).toBe('Example');
});

test('stored details reject malformed required fields', () => {
    expect(parseStoredAnimeDetails({ ...storedDetails, title: 42 })).toBeNull();
});
