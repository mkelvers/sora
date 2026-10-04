import { profileCookie, sessionCookie } from "$lib/server/sora";
import { attempt } from "@sora/shared";
import { SoraError } from "@sora/sdk";
import { redirect } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, cookies }) => {
	cookies.delete(sessionCookie, {
		path: "/",
	});
	cookies.delete(profileCookie, {
		path: "/",
	});

	if (locals.viewer) {
		const { error } = await attempt(locals.viewer.sora.signOut(), SoraError);
		if (error && error.status !== 401) {
			throw error;
		}
	}

	redirect(303, "/login");
};
