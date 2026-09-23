import { afterEach, expect, mock, spyOn, test } from 'bun:test';

import { requestKitsu } from './kitsu';

afterEach(() => {
    mock.restore();
});

const anilistMapping = {
    type: 'mappings',
    id: '20',
    attributes: {
        externalSite: 'anilist/anime',
        externalId: '123',
    },
    relationships: {
        item: {
            data: {
                type: 'anime',
                id: '10',
            },
        },
    },
};

const anime = {
    type: 'anime',
    id: '10',
    attributes: {
        canonicalTitle: 'Example anime',
        titles: {
            en: 'Example anime',
            en_jp: 'Example anime',
            ja_jp: null,
        },
        subtype: 'TV',
        status: 'finished',
        nsfw: false,
    },
    relationships: {
        mappings: {
            data: [
                {
                    type: 'mappings',
                    id: '20',
                },
            ],
        },
    },
};

test('resolves an AniList ID through Kitsu and preserves the external identity', async () => {
    const fetchMock = spyOn(global, 'fetch')
        .mockResolvedValueOnce(
            Response.json({
                data: [anilistMapping],
            })
        )
        .mockResolvedValueOnce(
            Response.json({
                data: [anime],
            })
        );

    const result = await requestKitsu('Anime', { id: 123 });

    expect(result).toEqual({
        Media: expect.objectContaining({
            id: 123,
            metadataSource: 'kitsu',
            metadataSourceId: 10,
            title: {
                english: 'Example anime',
                romaji: 'Example anime',
                native: null,
            },
        }),
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const mappingUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    const animeUrl = new URL(String(fetchMock.mock.calls[1]?.[0]));
    expect(mappingUrl.pathname.endsWith('/mappings')).toBe(true);
    expect(mappingUrl.searchParams.get('filter[externalSite]')).toBe('anilist/anime');
    expect(mappingUrl.searchParams.get('filter[externalId]')).toBe('123');
    expect(animeUrl.pathname.endsWith('/anime')).toBe(true);
    expect(animeUrl.searchParams.get('filter[id]')).toBe('10');
});

test('joins related anime by resource type and ID', async () => {
    spyOn(global, 'fetch')
        .mockResolvedValueOnce(
            Response.json({
                data: [anilistMapping],
            })
        )
        .mockResolvedValueOnce(
            Response.json({
                data: [
                    {
                        ...anime,
                        relationships: {
                            ...anime.relationships,
                            mediaRelationships: {
                                data: [
                                    {
                                        type: 'mediaRelationships',
                                        id: '30',
                                    },
                                ],
                            },
                            productions: {
                                data: [
                                    {
                                        type: 'productions',
                                        id: '31',
                                    },
                                ],
                            },
                            staff: {
                                data: [
                                    {
                                        type: 'staff',
                                        id: '32',
                                    },
                                ],
                            },
                        },
                    },
                ],
                included: [
                    {
                        type: 'mediaRelationships',
                        id: '30',
                        attributes: {
                            role: 'spinoff',
                        },
                        relationships: {
                            destination: {
                                data: {
                                    type: 'anime',
                                    id: '11',
                                },
                            },
                        },
                    },
                    {
                        ...anime,
                        id: '11',
                        relationships: {
                            mappings: {
                                data: [
                                    {
                                        type: 'mappings',
                                        id: '22',
                                    },
                                ],
                            },
                        },
                    },
                    {
                        type: 'mappings',
                        id: '22',
                        attributes: {
                            externalSite: 'anilist/anime',
                            externalId: '789',
                        },
                    },
                    {
                        type: 'productions',
                        id: '31',
                        attributes: {},
                        relationships: {
                            company: {
                                data: {
                                    type: 'companies',
                                    id: '33',
                                },
                            },
                        },
                    },
                    {
                        type: 'companies',
                        id: '33',
                        attributes: {
                            name: 'Example studio',
                        },
                    },
                    {
                        type: 'staff',
                        id: '32',
                        attributes: {
                            role: 'Director, Music',
                        },
                        relationships: {
                            person: {
                                data: {
                                    type: 'people',
                                    id: '34',
                                },
                            },
                        },
                    },
                    {
                        type: 'people',
                        id: '34',
                        attributes: {
                            name: 'Example creator',
                        },
                    },
                ],
            })
        );

    const result = await requestKitsu('Anime', { id: 123 });

    expect(result).toEqual({
        Media: expect.objectContaining({
            relations: {
                edges: [
                    expect.objectContaining({
                        relationType: 'SPIN_OFF',
                        node: expect.objectContaining({
                            id: 789,
                        }),
                    }),
                ],
            },
            studios: {
                nodes: [{ name: 'Example studio' }],
            },
            staff: {
                edges: [
                    {
                        role: 'Director',
                        node: {
                            name: {
                                full: 'Example creator',
                            },
                        },
                    },
                    {
                        role: 'Music',
                        node: {
                            name: {
                                full: 'Example creator',
                            },
                        },
                    },
                ],
            },
        }),
    });
});

test('filters adult catalog entries and translates supported browse filters', async () => {
    const fetchMock = spyOn(global, 'fetch').mockResolvedValue(
        Response.json({
            data: [
                anime,
                {
                    ...anime,
                    id: '11',
                    attributes: {
                        ...anime.attributes,
                        nsfw: true,
                    },
                    relationships: {
                        mappings: {
                            data: [
                                {
                                    type: 'mappings',
                                    id: '21',
                                },
                            ],
                        },
                    },
                },
            ],
            included: [
                anilistMapping,
                {
                    type: 'mappings',
                    id: '21',
                    attributes: {
                        externalSite: 'anilist/anime',
                        externalId: '456',
                    },
                },
            ],
        })
    );

    const result = await requestKitsu('BrowseAnimePage', {
        search: 'Example',
        status: 'FINISHED',
        sort: ['POPULARITY_DESC'],
        perPage: 2,
        isAdult: false,
    });

    expect(result).toEqual({
        Page: {
            media: [expect.objectContaining({ id: 123 })],
            pageInfo: { hasNextPage: false },
        },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get('filter[text]')).toBe('Example');
    expect(url.searchParams.get('filter[status]')).toBe('finished');
    expect(url.searchParams.get('sort')).toBe('-userCount');
});

test('rejects ambiguous external mappings before loading anime', async () => {
    const fetchMock = spyOn(global, 'fetch').mockResolvedValue(
        Response.json({
            data: [
                anilistMapping,
                {
                    ...anilistMapping,
                    id: '21',
                    relationships: {
                        item: {
                            data: {
                                type: 'anime',
                                id: '11',
                            },
                        },
                    },
                },
            ],
        })
    );

    await expect(requestKitsu('Anime', { id: 123 })).rejects.toThrow(
        'Kitsu has no unambiguous anilist/anime mapping for 123'
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
});

test('rejects a loaded anime whose reverse mapping identifies another AniList ID', async () => {
    spyOn(global, 'fetch')
        .mockResolvedValueOnce(
            Response.json({
                data: [anilistMapping],
            })
        )
        .mockResolvedValueOnce(
            Response.json({
                data: [
                    {
                        ...anime,
                        relationships: {
                            mappings: {
                                data: [
                                    {
                                        type: 'mappings',
                                        id: '21',
                                    },
                                ],
                            },
                        },
                    },
                ],
                included: [
                    {
                        ...anilistMapping,
                        id: '21',
                        attributes: {
                            externalSite: 'anilist/anime',
                            externalId: '456',
                        },
                    },
                ],
            })
        );

    await expect(requestKitsu('Anime', { id: 123 })).rejects.toThrow(
        'Kitsu returned conflicting metadata for anilist/anime:123'
    );
});
