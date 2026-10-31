import { route } from "@sora/sdk";
import { error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ locals }) => {
	const { viewer } = locals;
	if (!viewer?.profile) {
		error(401, "Choose a profile first");
	}

	const library = await viewer.sora.request(route.exportLibrary, {
		params: {
			profile_id: viewer.profile.id,
		},
	});
	const name = viewer.profile.name.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-");

	return Response.json(library, {
		headers: {
			"Cache-Control": "no-store",
			"Content-Disposition": `attachment; filename="sora-library-${name}-${library.exported_at.slice(0, 10)}.json"`,
			"Content-Type": "application/json",
		},
	});
};
