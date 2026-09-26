import { env } from '$env/dynamic/private';
import { getRequestEvent } from '$app/server';
import { error, redirect } from '@sveltejs/kit';
import { SoraClient, SoraError } from '@sora/sdk';

if (!env.SORA_API_URL) {
	throw new Error('SORA_API_URL is not set; see .env.example');
}

const baseUrl = env.SORA_API_URL;

/**
 * The app's client for what needs no account: the catalog, playback, and
 * signing in. Modules are evaluated once, so every server load, action, and
 * endpoint that imports it shares this instance.
 */
export const sora = new SoraClient({
	baseUrl
});

/**
 * The client for the signed-in account of the current request, and its
 * chosen profile. Sends to sign in or to choose a profile when either is
 * missing.
 */
export function profile() {
	const { locals } = getRequestEvent();
	if (!locals.token) {
		redirect(303, '/login');
	}
	if (!locals.profileId) {
		redirect(303, '/profiles');
	}

	return {
		sora: signedIn(locals.token),
		profileId: locals.profileId
	};
}

/** The client for the signed-in account of the current request. */
export function account() {
	const { locals } = getRequestEvent();
	if (!locals.token) {
		redirect(303, '/login');
	}

	return signedIn(locals.token);
}

function signedIn(token: string) {
	return new SoraClient({
		baseUrl,
		headers: {
			Authorization: `Bearer ${token}`
		}
	});
}

const cookie = (url: URL) => ({
	path: '/',
	httpOnly: true,
	sameSite: 'lax' as const,
	// Plain HTTP on a home network would otherwise drop the cookie.
	secure: url.protocol === 'https:',
	maxAge: 90 * 24 * 60 * 60
});

/** Remembers the session, for requests from now on. Only `form` and `command` functions may call it. */
export function rememberSession(token: string | undefined) {
	const { cookies, url } = getRequestEvent();
	if (token) {
		cookies.set('session', token, cookie(url));
	} else {
		cookies.delete('session', { path: '/' });
	}
	cookies.delete('profile', { path: '/' });
}

/** Remembers the chosen profile. Only `form` and `command` functions may call it. */
export function rememberProfile(profileId: string) {
	const { cookies, url } = getRequestEvent();
	cookies.set('profile', profileId, cookie(url));
}

/**
 * Runs a Sora call, passing its API errors on as the same HTTP errors. An
 * expired session sends to sign in, and a deleted profile to choosing one.
 */
export async function fromSora<T>(call: () => Promise<T>): Promise<T> {
	try {
		return await call();
	} catch (cause) {
		if (cause instanceof SoraError) {
			if (cause.status === 401) {
				redirect(303, '/login');
			}
			if (cause.code === 'PROFILE_NOT_FOUND') {
				redirect(303, '/profiles');
			}
			error(cause.status, cause.message);
		}
		throw cause;
	}
}
