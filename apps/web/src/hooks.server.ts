import { error, redirect, type Handle } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { gate, rememberProfile } from '$lib/server/access';
import { profileCookie, sessionCookie, soraAs } from '$lib/server/sora';

/**
 * Resolves the session and profile cookies to a viewer, and keeps requests
 * out until the viewer has signed in and chosen who is watching.
 *
 * Full page loads are turned away here. Client-side navigations only reach
 * the server through the `(protected)` layout's load, which applies the same
 * gate, so data requests pass through to it. Remote functions are called
 * directly and never run a load: they only need a signed-in viewer, and one
 * that acts for a profile checks for it itself.
 */
export const handle: Handle = async ({ event, resolve }) => {
	event.locals.viewer = null;

	const token = event.cookies.get(sessionCookie);
	if (token) {
		const sora = soraAs(token);
		try {
			const profiles = await sora.profiles();
			const chosen = event.cookies.get(profileCookie);
			const profile = profiles.find((profile) => profile.id === chosen) ?? null;

			event.locals.viewer = { sora, profiles, profile };
			if (profile) {
				rememberProfile(event.cookies, profile.id);
			}
		} catch (cause) {
			// An expired or revoked session; any other failure is the API's.
			if (!(cause instanceof SoraError && cause.status === 401)) {
				throw cause;
			}
			event.cookies.delete(sessionCookie, { path: '/' });
			event.cookies.delete(profileCookie, { path: '/' });
		}
	}

	if (event.isRemoteRequest) {
		if (!event.locals.viewer) {
			error(401, 'Not signed in');
		}
	} else if (!event.isDataRequest) {
		const target = gate(event.locals.viewer, event.url);
		if (target) {
			redirect(303, target);
		}
	}

	return resolve(event);
};
