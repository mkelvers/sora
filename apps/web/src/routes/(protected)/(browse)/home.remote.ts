import { command, getRequestEvent, query } from "$app/server";
import { sora } from "$lib/server/sora";
import { error } from "@sveltejs/kit";
import { z } from "zod";

export const getFeatured = query(async () => {
	const airing = await sora.browse({
		params: {
			status: "RELEASING",
			sort: "popular",
			per_page: 12,
		},
	});

	return airing.filter((card) => card.backdrop_url && card.logo_url).slice(0, 6);
});

export const getTrending = query(() =>
	sora.browse({
		params: {
			sort: "trending",
			per_page: 20,
		},
	}),
);

export const getContinueWatching = query(async () => {
	const { viewer } = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

	return viewer.sora.continueWatching(viewer.profile.id);
});

export const getRecommendations = query(async () => {
	const { viewer } = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

	return viewer.sora.recommendations(viewer.profile.id);
});

export const dismiss = command(z.string(), async (seriesId) => {
	const { viewer } = getRequestEvent().locals;
	if (!viewer?.profile) {
		error(403, "Choose a profile first");
	}

	await viewer.sora.dismissContinueWatching(viewer.profile.id, seriesId);
	await getContinueWatching().refresh();
});
