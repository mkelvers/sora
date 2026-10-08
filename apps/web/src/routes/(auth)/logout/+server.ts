import { knownProfiles } from "$lib/server/sora";
import { SoraError } from "@sora/sdk";
import { attempt } from "@sora/shared";
import { redirect } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

export const POST: RequestHandler = async ({ locals, cookies }) => {
	const token = cookies.get("sora_session");
	if (token) {
		knownProfiles.delete(token);
	}

	cookies.delete("sora_session", {
		path: "/",
	});
	cookies.delete("sora_profile", {
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
