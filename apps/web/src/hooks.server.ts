import { redirect, type Handle } from '@sveltejs/kit';

/** Pages reachable before choosing a profile, or before signing in. */
const open = ['/login', '/profiles'];

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.token = event.cookies.get('session');
	event.locals.profileId = event.cookies.get('profile');

	const { pathname } = event.url;

	// Remote functions and assets check the session themselves, if they need it.
	if (pathname.startsWith('/_app/')) {
		return resolve(event);
	}

	if (!event.locals.token && pathname !== '/login') {
		redirect(303, '/login');
	}

	if (!event.locals.profileId && !open.includes(pathname)) {
		redirect(303, '/profiles');
	}

	return resolve(event);
};
