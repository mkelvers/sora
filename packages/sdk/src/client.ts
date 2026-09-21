import {
    AccountRegistrationSchema,
    AnimeArtworkSchema,
    AnimePageDeferredSchema,
    AnimePageEpisodeInventorySchema,
    AnimePageEpisodeUpdatesSchema,
    AnimePageSchema,
    ApiErrorSchema,
    CatalogPageSchema,
    CatalogTaxonomySchema,
    HomePageSchema,
    MediaPageSchema,
    NotificationsResponseSchema,
    PlaybackProgressSchema,
    ReleaseCalendarSchema,
    SegmentRequestSchema,
    SegmentSaveResultSchema,
    SearchResponseSchema,
    SimulcastPageSchema,
    WatchPageSchema,
    WatchPlaybackSchema,
    WatchSegmentsSchema,
    WatchlistPageResponseSchema,
    WatchlistSelectionSchema,
    WatchlistStateResponseSchema,
    WatchlistStatesResponseSchema,
    WatchlistUpdateSchema,
    browseSearchParams,
    type BrowseFilters,
    type MediaPage,
} from '@soraorg/contracts/client';
import { z } from 'zod';

export type ArcFetch = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type ArcClientOptions = {
    baseUrl?: string;
    fetch?: ArcFetch;
    headers?: HeadersInit;
    credentials?: RequestCredentials;
};

export type ArcClient = ReturnType<typeof createArcClient>;

export class ArcApiError extends Error {
    readonly status: number;
    readonly code: string;

    constructor(status: number, code: string, message: string) {
        super(message);
        this.name = 'ArcApiError';
        this.status = status;
        this.code = code;
    }
}

const unreadCountSchema = z.object({ count: z.number().int().nonnegative() });
const accountResponseSchema = z.object({
    user: z.object({
        id: z.string(),
        name: z.string(),
        username: z.string(),
    }),
});
const successSchema = z.object({ success: z.literal(true) });
const revisionSchema = z.object({ revision: z.string().nullable() });

export type MediaUpdate =
    | { intent: 'refresh' }
    | { intent: 'logoSize'; logoSize: number }
    | { intent: 'select'; type: 'backdrop' | 'logo'; filePath: string | null };

function normalizeBaseUrl(baseUrl: string) {
    return baseUrl.replace(/\/$/, '');
}

function pathFor(baseUrl: string, path: string) {
    return `${baseUrl}/${path.replace(/^\//, '')}`;
}

function queryString(values: Record<string, string | number | null | undefined>) {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(values)) {
        if (value !== null && value !== undefined) {
            query.set(key, String(value));
        }
    }
    const encoded = query.toString();
    return encoded ? `?${encoded}` : '';
}

export function createArcClient(options: ArcClientOptions = {}) {
    const requestFetch = options.fetch ?? globalThis.fetch;
    const baseUrl = normalizeBaseUrl(options.baseUrl ?? '/v1');

    async function request<T>(
        path: string,
        schema: z.ZodType<T>,
        init: RequestInit = {}
    ): Promise<T> {
        const headers = new Headers(options.headers);
        for (const [key, value] of new Headers(init.headers)) {
            headers.set(key, value);
        }

        const response = await requestFetch(pathFor(baseUrl, path), {
            ...init,
            credentials: init.credentials ?? options.credentials ?? 'include',
            headers,
        });

        if (!response.ok) {
            const payload = await response.json().catch(() => null);

            const error = ApiErrorSchema.safeParse(payload);
            throw new ArcApiError(
                response.status,
                error.success ? error.data.error.code : 'REQUEST_FAILED',
                error.success ? error.data.error.message : `Arc request failed (${response.status})`
            );
        }

        if (response.status === 204) {
            return undefined as T;
        }

        return schema.parse(await response.json());
    }

    return {
        registerAccount(input: z.input<typeof AccountRegistrationSchema>) {
            return request('accounts', accountResponseSchema, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify(AccountRegistrationSchema.parse(input)),
            });
        },

        home() {
            return request('home', HomePageSchema);
        },

        removeContinueWatching(animeId: number) {
            return request(`home/continue-watching/${animeId}`, z.undefined(), {
                method: 'DELETE',
            });
        },

        search(query: string, options: { signal?: AbortSignal } = {}) {
            return request(`search${queryString({ q: query })}`, SearchResponseSchema, options);
        },

        schedule() {
            return request('schedule', ReleaseCalendarSchema);
        },

        taxonomy() {
            return request('taxonomy', CatalogTaxonomySchema);
        },

        catalog(
            kind: 'new' | 'popular',
            page: number,
            filters: BrowseFilters,
            options: { signal?: AbortSignal } = {}
        ) {
            const params = browseSearchParams(filters);
            params.set('page', String(page));
            return request(`${kind}?${params}`, CatalogPageSchema, options);
        },

        simulcast(season?: string, year?: number) {
            return request(
                `simulcast${queryString({ page: 1, season, year })}`,
                SimulcastPageSchema
            );
        },

        simulcastPage(
            page: number,
            season?: string,
            year?: number,
            options: { signal?: AbortSignal } = {}
        ) {
            return request(
                `simulcast${queryString({ page, season, year })}`,
                CatalogPageSchema,
                options
            );
        },

        getAnime(animeId: number) {
            return request(`anime/${animeId}`, AnimePageSchema);
        },

        getAnimeDeferred(animeId: number) {
            return request(`anime/${animeId}/deferred`, AnimePageDeferredSchema);
        },

        getAnimeArtwork(animeId: number) {
            return request(`anime/${animeId}/artwork`, AnimeArtworkSchema);
        },

        getEpisodeRevision(animeId: number) {
            return request(`anime/${animeId}/episodes/revision`, revisionSchema);
        },

        getEpisodeUpdates(
            animeId: number,
            options: {
                revision?: string | null;
                knownEpisodeIds?: readonly string[];
                signal?: AbortSignal;
            } = {}
        ) {
            return request<z.output<typeof AnimePageEpisodeUpdatesSchema> | null>(
                `anime/${animeId}/episodes/updates${queryString({
                    revision: options.revision,
                    known: options.knownEpisodeIds?.join(','),
                })}`,
                AnimePageEpisodeUpdatesSchema.nullable(),
                { signal: options.signal }
            );
        },

        retryEpisodeInventory(animeId: number) {
            return request(
                `anime/${animeId}/episodes/retry`,
                AnimePageEpisodeInventorySchema.nullable()
            );
        },

        getWatchPage(animeId: number, episodeId: string) {
            return request(
                `anime/${animeId}/episodes/${encodeURIComponent(episodeId)}`,
                WatchPageSchema
            );
        },

        getWatchSegments(animeId: number, episodeId: string) {
            return request(
                `anime/${animeId}/episodes/${encodeURIComponent(episodeId)}/segments`,
                WatchSegmentsSchema
            );
        },

        getWatchPlayback(animeId: number, episodeId: string) {
            return request(
                `anime/${animeId}/episodes/${encodeURIComponent(episodeId)}/playback`,
                WatchPlaybackSchema
            );
        },

        watchPlaybackUrl(animeId: number, episodeId: string) {
            return pathFor(
                baseUrl,
                `anime/${animeId}/episodes/${encodeURIComponent(episodeId)}/playback`
            );
        },

        getMedia(animeId: number): Promise<MediaPage> {
            return request(`anime/${animeId}/media`, MediaPageSchema);
        },

        updateMedia(animeId: number, input: MediaUpdate) {
            return request(`anime/${animeId}/media`, successSchema, {
                method: 'PUT',
                body: JSON.stringify(input),
            });
        },

        watchlist: {
            page(selection: z.input<typeof WatchlistSelectionSchema> = {}) {
                const parsed = WatchlistSelectionSchema.parse(selection);
                return request(`watchlist${queryString(parsed)}`, WatchlistPageResponseSchema);
            },

            states() {
                return request('watchlist/states', WatchlistStatesResponseSchema);
            },

            state(animeId: number) {
                return request(`watchlist/${animeId}`, WatchlistStateResponseSchema);
            },

            set(animeId: number, input: z.input<typeof WatchlistUpdateSchema>) {
                return request(`watchlist/${animeId}`, WatchlistStateResponseSchema, {
                    method: 'PUT',
                    body: JSON.stringify(WatchlistUpdateSchema.parse(input)),
                });
            },

            remove(animeId: number) {
                return request(`watchlist/${animeId}`, z.undefined(), { method: 'DELETE' });
            },

            import(file: File, replace = false) {
                const body = new FormData();
                body.set('watchlist', file);
                body.set('replace', String(replace));
                return request('watchlist/import', z.object({ message: z.string() }), {
                    method: 'POST',
                    body,
                });
            },
        },

        notifications: {
            list() {
                return request('notifications', NotificationsResponseSchema);
            },

            unreadCount() {
                return request('notifications/unread-count', unreadCountSchema);
            },

            markRead(id: string) {
                return request(`notifications/${encodeURIComponent(id)}/read`, z.undefined(), {
                    method: 'POST',
                });
            },
        },

        progress: {
            save(
                input: z.input<typeof PlaybackProgressSchema>,
                options: { keepalive?: boolean } = {}
            ) {
                return request('progress', z.undefined(), {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(PlaybackProgressSchema.parse(input)),
                    keepalive: options.keepalive,
                });
            },
        },

        segments: {
            save(input: z.input<typeof SegmentRequestSchema>) {
                return request('segments', SegmentSaveResultSchema.nullable(), {
                    method: 'PUT',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify(SegmentRequestSchema.parse(input)),
                });
            },
        },

        streamUrl(source: string) {
            return pathFor(baseUrl, `stream${queryString({ source })}`);
        },
    };
}
