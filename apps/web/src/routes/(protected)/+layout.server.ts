import { redirect } from '@sveltejs/kit';
import { gate } from '$lib/server/access';
import type { LayoutServerLoad } from './$types';

/**
 * Applies the sign-in and profile gate on client-side navigations, which
 * never make a full page request for `hooks.server.ts` to turn away.
 * Reading `url` reruns this on every navigation, so a profile that runs out
 * mid-visit is caught on the next one.
 */
export const load: LayoutServerLoad = ({ locals, url }) => {
	const target = gate(locals.viewer, url);
	if (target) {
		redirect(303, target);
	}
};
