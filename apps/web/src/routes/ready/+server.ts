import { SORA_API_URL } from "$app/env/private";
import { apiReady } from "$lib/server/readiness";
import { json } from "@sveltejs/kit";

export const GET = async () => {
	const ready = await apiReady(SORA_API_URL);
	return json(
		{ service: "web", status: ready ? "ready" : "unavailable" },
		{
			headers: { "Cache-Control": "no-store" },
			status: ready ? 200 : 503,
		},
	);
};
