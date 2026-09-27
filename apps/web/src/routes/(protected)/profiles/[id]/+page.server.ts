import { error, fail, redirect } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
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
		choices: Array.from({ length: 11 }, () => crypto.randomUUID().slice(0, 8))
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params, url }) => {
		const form = await request.formData();
		const name = String(form.get('name') ?? '');
		const changes = Changes.safeParse({
			name,
			avatar: form.get('avatar')
		});

		if (!changes.success) {
			return fail(400, {
				name,
				message: 'Give the profile a name of up to 40 characters.'
			});
		}

		try {
			await locals.viewer!.sora.updateProfile(params.id, changes.data);
		} catch (cause) {
			if (cause instanceof SoraError && cause.status === 404) {
				error(404, 'No such profile');
			}
			throw cause;
		}

		redirect(303, `/profiles${url.search}`);
	}
};
