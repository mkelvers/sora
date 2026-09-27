import { error, fail, redirect } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { profileCookie } from '$lib/server/sora';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	return {
		profiles: locals.viewer!.profiles,
	};
};

export const actions: Actions = {
	select: async ({ request, locals, cookies, url }) => {
		const id = (await request.formData()).get('profile');
		const profile = locals.viewer!.profiles.find((profile) => profile.id === id);

		if (!profile) {
			error(404, 'No such profile');
		}

		cookies.set(profileCookie, profile.id, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			maxAge: 60 * 60,
		});

		const target = new URL(url.searchParams.get('redirect') ?? '/', url.origin);
		redirect(303, target.origin === url.origin ? target.pathname + target.search : '/');
	},

	delete: async ({ request, locals, cookies }) => {
		const id = String((await request.formData()).get('profile') ?? '');

		try {
			await locals.viewer!.sora.deleteProfile(id);
		} catch (cause) {
			if (cause instanceof SoraError && cause.code === 'LAST_PROFILE') {
				return fail(409, {
					message: 'An account keeps at least one profile.',
				});
			}
			if (cause instanceof SoraError && cause.status === 404) {
				error(404, 'No such profile');
			}
			throw cause;
		}

		if (locals.viewer!.profile?.id === id) {
			cookies.delete(profileCookie, {
				path: '/',
			});
		}
	},
};
