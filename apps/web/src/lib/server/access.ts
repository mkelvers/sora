import type { Cookies } from '@sveltejs/kit';
import { profileCookie } from './sora';

/** Paths anyone may open; everything else needs a signed-in viewer. */
const publicPaths = ['/login'];

/** Paths a signed-in viewer may open before choosing a profile. */
const profilePaths = ['/profiles', '/logout'];

/**
 * How long a chosen profile lasts without use. Every request renews it, so it
 * only runs out after an hour away, and the next visit asks who is watching.
 */
const profileLifetime = 60 * 60;

function isUnder(pathname: string, paths: string[]) {
	return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Where a viewer must go before opening `url`: signing in, then choosing a
 * profile. `null` when they may open it.
 */
export function gate(viewer: App.Locals['viewer'], url: URL): string | null {
	const here = encodeURIComponent(url.pathname + url.search);

	if (!viewer && !isUnder(url.pathname, publicPaths)) {
		return `/login?redirect=${here}`;
	}

	if (viewer && !viewer.profile && !isUnder(url.pathname, [...publicPaths, ...profilePaths])) {
		return `/profiles?redirect=${here}`;
	}

	return null;
}

/** Makes `profileId` the profile watching, for the next hour of use. */
export function rememberProfile(cookies: Cookies, profileId: string) {
	cookies.set(profileCookie, profileId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: profileLifetime
	});
}
