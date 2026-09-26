import { error, redirect } from '@sveltejs/kit';
import { rememberProfile } from '$lib/server/access';
import { safeRedirect } from '$lib/utils';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals }) => {
	return {
		profiles: locals.viewer!.profiles
	};
};

export const actions: Actions = {
	default: async ({ request, locals, cookies, url }) => {
		const id = (await request.formData()).get('profile');
		const profile = locals.viewer!.profiles.find((profile) => profile.id === id);

		if (!profile) {
			error(404, 'No such profile');
		}

		rememberProfile(cookies, profile.id);
		redirect(303, safeRedirect(url));
	}
};
