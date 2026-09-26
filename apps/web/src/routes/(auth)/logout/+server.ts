import { redirect } from '@sveltejs/kit';
import { profileCookie, sessionCookie } from '$lib/server/sora';
import type { RequestHandler } from './$types';

/** Ends the session on the API as well as in this browser. */
export const POST: RequestHandler = async ({ locals, cookies }) => {
	await locals.viewer?.sora.signOut().catch(() => {});
	cookies.delete(sessionCookie, { path: '/' });
	cookies.delete(profileCookie, { path: '/' });
	redirect(303, '/login');
};
