import { profileCookie, sessionCookie } from "$lib/server/sora";
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

	try {
		await locals.viewer?.sora.signOut();
	} catch (cause) {
		if (!(cause instanceof SoraError && cause.status === 401)) {
			throw cause;
		}
	}

	redirect(303, "/login");
};
