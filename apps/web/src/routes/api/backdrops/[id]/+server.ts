import { SORA_API_URL } from "$app/env/private";
import { attempt } from "@sora/shared";
import { error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, cookies, locals }) => {
	const session = cookies.get("sora_session");
	if (!locals.viewer || !session) {
		error(401, "Not signed in");
	}

	const { data: upstream, error: unreachable } = await attempt(
		fetch(`${SORA_API_URL}/v1/backdrops/${encodeURIComponent(params.id)}`, {
			headers: {
				Authorization: `Bearer ${session}`,
			},
		}),
	);
	if (unreachable) {
		error(502, "Not available");
	}

	if (!upstream.ok) {
		error(upstream.status === 404 ? 404 : 502, "Not available");
	}

	return new Response(upstream.body, {
		headers: {
			"Cache-Control": "private, max-age=31536000, immutable",
			"Content-Type": "image/jpeg",
		},
	});
};
