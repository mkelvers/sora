import { z } from 'zod';

import { concatByteChunks } from '../utils';

export const anikotoUrl = 'https://anikototv.to';
export const catalogUrl = 'https://anikotoapi.site';
// Throttling and upstream cooldowns are shared by requests in this process.
const providerCooldownUntil = {
    catalog: 0,
    ajax: 0,
    site: 0,
};
let providerRequestTail = Promise.resolve();
let lastProviderRequestAt = 0;
const transientProviderTransportCodes = new Set([
    'EAI_AGAIN',
    'ECONNREFUSED',
    'ECONNRESET',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'ENOTFOUND',
    'EPIPE',
    'ETIMEDOUT',
]);

export class AniKotoRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
        readonly retryAfterMs?: number,
        readonly localCooldown = false
    ) {
        super(message);
    }
}

function providerTransportCode(cause: unknown) {
    if (!(cause instanceof Error)) {
        return null;
    }

    const error = cause as Error & { code?: string };
    if (error.code && transientProviderTransportCodes.has(error.code)) {
        return error.code;
    }

    if (!(error.cause instanceof Error)) {
        return null;
    }

    const nested = error.cause as Error & { code?: string };
    return nested.code && transientProviderTransportCodes.has(nested.code) ? nested.code : null;
}

export function isAniKotoTransientError(cause: unknown) {
    if (cause instanceof AniKotoRequestError) {
        return cause.status === 429 || cause.status >= 500;
    }

    if (providerTransportCode(cause) !== null) {
        return true;
    }

    if (cause instanceof DOMException && cause.name === 'TimeoutError') {
        return true;
    }

    return cause instanceof AggregateError && cause.errors.some(isAniKotoTransientError);
}

function retryAfterMs(value: string | null) {
    if (!value) {
        return null;
    }

    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) {
        return Math.ceil(seconds * 1000);
    }

    const timestamp = Date.parse(value);
    return Number.isFinite(timestamp) ? Math.max(0, timestamp - Date.now()) : null;
}

export async function abortable<T>(operation: Promise<T>, signal?: AbortSignal): Promise<T> {
    if (!signal) {
        return operation;
    }

    let onAbort!: () => void;
    const aborted = new Promise<never>((_, reject) => {
        onAbort = () => reject(signal.reason);
        if (signal.aborted) {
            onAbort();
        } else {
            signal.addEventListener('abort', onAbort, { once: true });
        }
    });
    try {
        return await Promise.race([operation, aborted]);
    } finally {
        signal.removeEventListener('abort', onAbort);
    }
}

async function abortableDelay(delay: number, signal?: AbortSignal) {
    let timer!: NodeJS.Timeout;
    try {
        await abortable(
            new Promise<void>((resolve) => {
                timer = setTimeout(resolve, delay);
            }),
            signal
        );
    } finally {
        clearTimeout(timer);
    }
}

async function waitForProviderRequestSlot(signal?: AbortSignal) {
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
        release = resolve;
    });
    const previous = providerRequestTail;
    providerRequestTail = previous.then(() => turn);
    await previous;

    try {
        const wait = 1_000 - (Date.now() - lastProviderRequestAt);
        if (wait > 0) {
            await abortableDelay(wait, signal);
        }
        lastProviderRequestAt = Date.now();
    } catch (cause) {
        release();
        throw cause;
    }

    return release;
}

async function readBounded(response: Response, limit: number, signal?: AbortSignal) {
    const contentLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > limit) {
        await response.body?.cancel();
        throw new Error('AniKoto response exceeded its size limit');
    }

    if (!response.body) {
        const text = await response.text();
        const bytes = new TextEncoder().encode(text);
        if (bytes.byteLength > limit) {
            throw new Error('AniKoto response exceeded its size limit');
        }
        return bytes;
    }

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
        while (true) {
            const chunk = await abortable(reader.read(), signal);
            if (chunk.done) {
                break;
            }
            size += chunk.value.byteLength;
            if (size > limit) {
                await reader.cancel();
                throw new Error('AniKoto response exceeded its size limit');
            }
            chunks.push(chunk.value);
        }
    } catch (cause) {
        await reader.cancel().catch(() => undefined);
        throw cause;
    } finally {
        reader.releaseLock();
    }

    return concatByteChunks(chunks, size);
}

export async function requestText(
    url: URL,
    options: {
        /** Accept header used for the provider request. */

        accept?: string;
        /** Referer required by some provider endpoints. */
        referer?: string;
        /** Maximum response body size; oversized pages are rejected while streaming. */
        maxBytes?: number;
        /** Cancels the request and response-body read. */
        signal?: AbortSignal;
        /** Applies the provider-specific request throttle. */
        throttle?: boolean;
    } = {}
): Promise<string> {
    const requestTimeoutMs = 10_000;
    const headers = new Headers({
        Accept: options.accept ?? 'text/html',
        Referer: options.referer ?? `${anikotoUrl}/`,
        'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/140 Safari/537.36',
    });
    if (options.accept === 'application/json') {
        headers.set('X-Requested-With', 'XMLHttpRequest');
    }

    const requestFamily =
        url.origin === catalogUrl ? 'catalog' : url.pathname.startsWith('/ajax/') ? 'ajax' : 'site';
    const cooldownUntil = providerCooldownUntil[requestFamily];
    if (cooldownUntil > Date.now()) {
        const cooldown = cooldownUntil - Date.now();
        throw new AniKotoRequestError(
            `AniKoto local request cooldown is active for ${url.hostname}${url.pathname} (${cooldown}ms remaining)`,
            429,
            cooldown,
            true
        );
    }

    for (let attempt = 0; ; attempt += 1) {
        const releaseRequestSlot =
            options.throttle !== false && (url.origin === anikotoUrl || url.origin === catalogUrl)
                ? await waitForProviderRequestSlot(options.signal)
                : null;
        try {
            const response = await fetch(url, {
                headers,
                signal: options.signal
                    ? AbortSignal.any([options.signal, AbortSignal.timeout(requestTimeoutMs)])
                    : AbortSignal.timeout(requestTimeoutMs),
            });
            if (!response.ok) {
                const retryAfter = retryAfterMs(response.headers.get('retry-after'));
                if (response.status === 429) {
                    const cooldown =
                        retryAfter !== null && retryAfter <= 5 * 60_000 ? retryAfter : 30_000;
                    providerCooldownUntil[requestFamily] = Date.now() + cooldown;
                    await response.body?.cancel().catch(() => undefined);
                    throw new AniKotoRequestError(
                        `AniKoto returned 429 for ${url.hostname}${url.pathname} (cooldown ${cooldown}ms)`,
                        response.status,
                        cooldown
                    );
                }
                if (
                    [500, 502, 503, 504].includes(response.status) &&
                    attempt < 2 &&
                    (retryAfter === null || retryAfter <= 60_000)
                ) {
                    const delay = retryAfter ?? Math.min(60_000, 500 * 2 ** attempt);
                    await response.body?.cancel().catch(() => undefined);
                    await abortableDelay(delay, options.signal);
                    continue;
                }
                throw new AniKotoRequestError(
                    `AniKoto returned ${response.status} for ${url.hostname}${url.pathname}`,
                    response.status
                );
            }

            return new TextDecoder().decode(
                await readBounded(response, options.maxBytes ?? 2 * 1024 * 1024, options.signal)
            );
        } catch (cause) {
            if (cause instanceof DOMException && cause.name === 'TimeoutError') {
                const cooldown = 30_000;
                providerCooldownUntil[requestFamily] = Date.now() + cooldown;
                throw new AniKotoRequestError(
                    `AniKoto request timed out for ${url.hostname}${url.pathname} (cooldown ${cooldown}ms)`,
                    504,
                    cooldown
                );
            }
            const transportCode = providerTransportCode(cause);
            if (transportCode) {
                const cooldown = 30_000;
                providerCooldownUntil[requestFamily] = Date.now() + cooldown;
                throw new AniKotoRequestError(
                    `AniKoto request failed for ${url.hostname}${url.pathname} (${transportCode}; cooldown ${cooldown}ms)`,
                    503,
                    cooldown
                );
            }
            throw cause;
        } finally {
            releaseRequestSlot?.();
        }
    }
}

export async function requestJson(
    url: URL,
    referer = `${anikotoUrl}/`,
    signal?: AbortSignal,
    throttle = true
) {
    const text = await requestText(url, {
        accept: 'application/json',
        referer,
        signal,
        throttle,
    });
    try {
        return z.json().parse(JSON.parse(text));
    } catch (cause) {
        throw new Error('AniKoto returned invalid JSON', { cause });
    }
}
