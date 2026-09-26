import { redirect } from '@sveltejs/kit';
import { sessionCookie } from '$lib/server/sora';
import type { RequestHandler } from './$types';

/** Ends the session on the API as well as in this browser. */
export const POST: RequestHandler = async ({ locals, cookies }) => {
	await locals.viewer?.sora.signOut().catch(() => {});
	cookies.delete(sessionCookie, { path: '/' });
	redirect(303, '/login');
};
