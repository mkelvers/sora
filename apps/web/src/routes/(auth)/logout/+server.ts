import { redirect } from '@sveltejs/kit';
import { profileCookie, sessionCookie } from '$lib/server/sora';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, cookies }) => {
	await locals.viewer?.sora.signOut().catch(() => {});
	cookies.delete(sessionCookie, {
		path: '/',
	});
	cookies.delete(profileCookie, {
		path: '/',
	});
	redirect(303, '/login');
};
