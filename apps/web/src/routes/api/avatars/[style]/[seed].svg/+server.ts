import { Avatar, Style } from "@dicebear/core";
import crittersDefinition from "@dicebear/styles/critters.json";
import sproutsDefinition from "@dicebear/styles/sprouts.json";
import { error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

const sprouts = new Style(sproutsDefinition);
const critters = new Style(crittersDefinition);

const tops: Record<string, number> = {
	ball: 25.5,
	buds: 28.5,
	bush: 25,
	cactus: 24,
	flower: 11,
	grass: 36,
	palm: 19.5,
	seedling: 12,
	sprout: 26,
	succulent: 34,
	tall: 14,
	tulip: 21,
};

function draw(style: string, seed: string) {
	const options = {
		seed,
		animationVariant: "fastest",
	} as const;

	if (style === "critters") {
		return new Avatar(critters, {
			...options,
			backgroundColor: [],
		}).toString();
	}

	const variant = new Avatar(sprouts, options).toJSON().options.plantVariant;
	const top = tops[String(variant)] ?? tops.flower;

	return new Avatar(sprouts, {
		...options,
		backgroundColor: [],
		scale: 1,
		translateX: -1.5,
		translateY: -((top + 109.5) / 2 - 50),
	}).toString();
}

export const GET: RequestHandler = ({ params, locals }) => {
	if (!locals.viewer) {
		error(401, "Not signed in");
	}

	if (!["sprouts", "critters"].includes(params.style) || params.seed.length > 64) {
		error(404, "No such avatar");
	}

	return new Response(draw(params.style, params.seed), {
		headers: {
			"Content-Type": "image/svg+xml",
			"Cache-Control": "private, max-age=31536000, immutable",
			"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
			"X-Content-Type-Options": "nosniff",
		},
	});
};
