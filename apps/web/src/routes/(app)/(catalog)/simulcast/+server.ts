import { error, redirect } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";
import { listSeasons } from "./seasons";

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.viewer) {
		error(401, "Not signed in");
	}

	const { current } = await listSeasons(locals.viewer.sora);

	redirect(307, `/simulcast/seasons/${current.slug}`);
};
