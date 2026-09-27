import { error, type Handle, type HandleServerError } from '@sveltejs/kit';
import { SoraClient, SoraError } from '@sora/sdk';
import { env } from '$env/dynamic/private';
import { profileCookie, sessionCookie } from '$lib/server/sora';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.viewer = null;

	const token = event.cookies.get(sessionCookie);
	if (token) {
		const sora = new SoraClient({
			baseUrl: env.SORA_API_URL!,
			headers: {
				Authorization: `Bearer ${token}`
			}
		});

		try {
			const profiles = await sora.profiles();
			const chosen = event.cookies.get(profileCookie);
			const profile = profiles.find((profile) => profile.id === chosen) ?? null;

			event.locals.viewer = {
				sora,
				profiles,
				profile
			};

			if (profile) {
				event.cookies.set(profileCookie, profile.id, {
					path: '/',
					httpOnly: true,
					sameSite: 'lax',
					maxAge: 60 * 60
				});
			}
		} catch (cause) {
			if (!(cause instanceof SoraError && cause.status === 401)) {
				throw cause;
			}
			event.cookies.delete(sessionCookie, {
				path: '/'
			});
			event.cookies.delete(profileCookie, {
				path: '/'
			});
		}
	}

	if (event.isRemoteRequest && !event.locals.viewer) {
		error(401, 'Not signed in');
	}

	return resolve(event);
};

export const handleError: HandleServerError = ({ error }) => {
	if (error instanceof SoraError) {
		return {
			message: error.message
		};
	}
};
