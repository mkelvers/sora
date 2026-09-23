// MegaPlay returns the concrete media hostname in its source payload. Keep the
// registrable domains here, rather than individual CDN shards, so new provider
// subdomains work without another release while the proxy remains allowlisted.
const aniKotoMediaHostSuffixes = [
    'akirax.buzz',
    'anizara.store',
    'imgnex.top',
    'kryntal.top',
    'lostproject.club',
    'megaplay.buzz',
    'mikora.top',
    'norami.top',
    'shiora.site',
    'shiora.top',
    'tiktokcdn.com',
    'trycloud.pro',
    'watching.onl',
] as const;
const megaPlayMediaMirrorSuffixes = [
    'akirax.buzz',
    'mikora.top',
    'norami.top',
    'shiora.site',
    'shiora.top',
] as const;
export const aniKotoMediaReferer = 'https://megaplay.buzz/';
export function isAniKotoDisguisedSegmentHost(hostname: string) {
    return (
        /^p\d+-ad-site-sign-sg\.tiktokcdn\.com$/.test(hostname) ||
        /^s\d+\.(?:akirax\.buzz|norami\.top|shiora\.site|shiora\.top)$/.test(hostname)
    );
}

export function unwrapAniKotoDisguisedSegment(value: Uint8Array) {
    const bytes = Buffer.from(value.buffer, value.byteOffset, value.byteLength);
    const pngEnd = bytes.indexOf(new Uint8Array([0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82]));
    if (pngEnd >= 0) {
        return value.slice(pngEnd + 8);
    }

    if (value[0] === 0xff && value[1] === 0xd8) {
        const jpegEnd = bytes.indexOf(new Uint8Array([0xff, 0xd9]), 1);
        if (jpegEnd >= 0) {
            return value.slice(jpegEnd + 2);
        }
    }

    return value;
}

export function normalizeAniKotoMediaUrl(url: URL) {
    if (
        !url ||
        url.protocol !== 'https:' ||
        url.username ||
        url.password ||
        url.port ||
        !aniKotoMediaHostSuffixes.some(
            (suffix) => url.hostname === suffix || url.hostname.endsWith(`.${suffix}`)
        )
    ) {
        return null;
    }

    const normalized = new URL(url.toString());
    const shard = normalized.hostname.match(/^(s\d+)\.shiora\.(?:site|top)$/i)?.[1];
    if (shard) {
        normalized.hostname = `${shard}.akirax.buzz`;
    }
    return normalized;
}

export function aniKotoMediaCandidates(url: URL) {
    const candidates = [url];
    if (url.hostname.endsWith('.imgnex.top') && url.pathname.startsWith('/anime/')) {
        for (const suffix of megaPlayMediaMirrorSuffixes) {
            const alternate = new URL(url);
            alternate.hostname = `megap.${suffix}`;
            alternate.pathname = url.pathname.slice('/anime'.length);
            candidates.push(alternate);
        }
    }
    if (url.hostname.endsWith('.mikora.top')) {
        for (const suffix of ['shiora.site', 'akirax.buzz']) {
            const alternate = new URL(url);
            alternate.hostname = alternate.hostname.replace(/\.mikora\.top$/, `.${suffix}`);
            candidates.push(alternate);
        }
    }
    if (url.hostname.endsWith('.shiora.top')) {
        const alternate = new URL(url);
        alternate.hostname = alternate.hostname.replace(/\.shiora\.top$/, '.shiora.site');
        candidates.push(alternate);
    }
    if (url.hostname === 'cdn.kryntal.top' || url.hostname === 'ncdn.kryntal.top') {
        for (const prefix of ['cdn', 'ncdn']) {
            const alternate = new URL(url);
            alternate.hostname = `${prefix}.watching.onl`;
            if (!candidates.some((candidate) => candidate.hostname === alternate.hostname)) {
                candidates.push(alternate);
            }
        }
    }
    return candidates;
}

export function validHttpsUrl(value: string | undefined) {
    if (!value?.trim()) {
        return null;
    }

    try {
        const url = new URL(value);
        if (url.protocol !== 'https:' || url.username || url.password || url.port) {
            return null;
        }
        return url;
    } catch {
        return null;
    }
}

export function supportedMediaUrl(value: string) {
    const url = validHttpsUrl(value);
    const normalized = url ? normalizeAniKotoMediaUrl(url) : null;
    if (!normalized) {
        return null;
    }

    return /\.(?:m3u8|mp4)$/i.test(normalized.pathname) ? normalized : null;
}

export function supportedSubtitleUrl(value: string) {
    const url = validHttpsUrl(value);
    const normalized = url ? normalizeAniKotoMediaUrl(url) : null;
    if (!normalized || !/\.vtt$/i.test(normalized.pathname)) {
        return null;
    }

    return normalized;
}
