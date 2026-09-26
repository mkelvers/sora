import { error, fail, redirect } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
import { profileCookie } from '$lib/server/sora';
import { avatarSeeds, profilesPath, safeRedirect } from '$lib/utils';
import type { Actions, PageServerLoad } from './$types';

const Changes = z.object({
	name: z.string().trim().min(1).max(40),
	avatar: z.string().trim().min(1).max(64)
});

export const load: PageServerLoad = ({ locals, params }) => {
	const profile = locals.viewer!.profiles.find((profile) => profile.id === params.id);
	if (!profile) {
		error(404, 'No such profile');
	}

	return {
		profile,
		// Drawn here so the page renders the same choices it hydrates with.
		choices: avatarSeeds(11),
		// An account keeps at least one profile.
		deletable: locals.viewer!.profiles.length > 1
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params, url }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const changes = Changes.safeParse({ name, avatar: form.get('avatar') });

		if (!changes.success) {
			return fail(400, { name, message: 'Give the profile a name of up to 40 characters.' });
		}

		try {
			await locals.viewer!.sora.updateProfile(params.id, changes.data);
		} catch (cause) {
			if (cause instanceof SoraError && cause.status === 404) {
				error(404, 'No such profile');
			}
			throw cause;
		}

		redirect(303, profilesPath(safeRedirect(url), true));
	},

	delete: async ({ locals, params, cookies, url }) => {
		try {
			await locals.viewer!.sora.deleteProfile(params.id);
		} catch (cause) {
			if (cause instanceof SoraError && cause.code === 'LAST_PROFILE') {
				return fail(409, { message: 'An account keeps at least one profile.' });
			}
			if (cause instanceof SoraError && cause.status === 404) {
				error(404, 'No such profile');
			}
			throw cause;
		}

		// Whoever was watching as this profile must choose again.
		if (locals.viewer!.profile?.id === params.id) {
			cookies.delete(profileCookie, { path: '/' });
		}
		redirect(303, profilesPath(safeRedirect(url), true));
	}
};
