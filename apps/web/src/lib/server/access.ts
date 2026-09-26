import type { Cookies } from '@sveltejs/kit';
import { profileCookie } from './sora';

const publicPaths = ['/login'];
const profilePaths = ['/profiles', '/logout'];

const profileLifetime = 60 * 60;

function isUnder(pathname: string, paths: string[]) {
	return paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

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

export function rememberProfile(cookies: Cookies, profileId: string) {
	cookies.set(profileCookie, profileId, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		maxAge: profileLifetime
	});
}
