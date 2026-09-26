import { fail, redirect } from '@sveltejs/kit';
import { SoraError } from '@sora/sdk';
import { z } from 'zod';
import { profilesPath, safeRedirect } from '$lib/utils';
import type { Actions } from './$types';

const Name = z.string().trim().min(1).max(40);

export const actions: Actions = {
	default: async ({ request, locals, url }) => {
		const name = String((await request.formData()).get('name') ?? '');
		const parsed = Name.safeParse(name);

		if (!parsed.success) {
			return fail(400, { name, message: 'Give the profile a name of up to 40 characters.' });
		}

		try {
			await locals.viewer!.sora.createProfile({ name: parsed.data });
		} catch (cause) {
			if (cause instanceof SoraError && cause.status === 422) {
				return fail(400, { name, message: 'Give the profile a name of up to 40 characters.' });
			}
			throw cause;
		}

		// Back to choosing who is watching: adding a profile does not pick it.
		redirect(303, profilesPath(safeRedirect(url)));
	}
};
