import { error, redirect, type Handle } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { sessionCookie, soraAs } from '$lib/server/sora';

/** Paths anyone may open; everything else needs a signed-in viewer. */
const publicPaths = ['/login'];

/**
 * Resolves the session cookie to a viewer, and keeps signed-out requests out
 * of everything but the sign-in page.
 *
 * Guarding here rather than in a layout also covers remote functions, which
 * are called directly and never run a layout's load.
 */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.viewer = null;

	const token = event.cookies.get(sessionCookie);
	if (token) {
		const sora = soraAs(token);
		try {
			const [profile] = await sora.profiles();
			if (profile) {
				event.locals.viewer = { sora, profile };
			}
		} catch (cause) {
			// An expired or revoked session; any other failure is the API's.
			if (!(cause instanceof SoraError && cause.status === 401)) {
				throw cause;
			}
			event.cookies.delete(sessionCookie, { path: '/' });
		}
	}

	const { pathname, search } = event.url;
	const isPublic = publicPaths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

	if (!event.locals.viewer && !isPublic) {
		if (event.isRemoteRequest) {
			error(401, 'Not signed in');
		}
		redirect(303, `/login?redirect=${encodeURIComponent(pathname + search)}`);
	}

	return resolve(event);
};
