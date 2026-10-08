import { env } from "$env/dynamic/private";
import { attempt } from "@sora/shared";
import { error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ params, request, locals, cookies }) => {
	const session = cookies.get("sora_session");
	if (!locals.viewer?.profile || !session) {
		error(401, "Not signed in");
	}

	const site = request.headers.get("sec-fetch-site");
	const destination = request.headers.get("sec-fetch-dest");
	if (
		(site !== null && site !== "same-origin") ||
		(destination !== null && !["video", "audio", "track", "empty"].includes(destination))
	) {
		error(403, "Not available");
	}

	const headers = new Headers({
		Authorization: `Bearer ${session}`,
		"X-Sora-Client-Key": env.WEB_CLIENT_KEY!,
	});
	const range = request.headers.get("range");
	if (range) {
		headers.set("Range", range);
	}

	const { data: upstream, error: unreachable } = await attempt(
		fetch(`${env.SORA_API_URL}/v1/streams/${encodeURIComponent(params.token)}`, {
			headers,
			signal: request.signal,
		}),
	);
	if (unreachable) {
		error(502, "Not available");
	}

	if (!upstream.ok) {
		const unavailable = new Headers();
		const retryAfter = upstream.headers.get("Retry-After");
		if (retryAfter) {
			unavailable.set("Retry-After", retryAfter);
		}

		return new Response(null, {
			status: upstream.status >= 500 ? 502 : upstream.status,
			headers: unavailable,
		});
	}

	const forwarded = new Headers();
	for (const name of [
		"Accept-Ranges",
		"Cache-Control",
		"Content-Length",
		"Content-Range",
		"Content-Type",
		"Retry-After",
	]) {
		const value = upstream.headers.get(name);
		if (value !== null) {
			forwarded.set(name, value);
		}
	}

	return new Response(upstream.body, {
		status: upstream.status,
		headers: forwarded,
	});
};
