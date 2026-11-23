import { Avatar, Style } from "@dicebear/core";
import crittersDefinition from "@dicebear/styles/critters.json";
import sproutsDefinition from "@dicebear/styles/sprouts.json";
import { defined } from "@sora/shared";
import { error } from "@sveltejs/kit";

import type { RequestHandler } from "./$types";

/** A profile picture, drawn from its style and seed. */
class Picture {
	static readonly #sprouts = new Style(sproutsDefinition);
	static readonly #critters = new Style(crittersDefinition);
	static readonly #tops = new Map<string, number>(
		Object.entries({
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
		}),
	);

	readonly #style: string;
	readonly #seed: string;

	constructor(style: string, seed: string) {
		this.#style = style;
		this.#seed = seed;
	}

	get svg() {
		const options = {
			animationVariant: "fastest",
			seed: this.#seed,
		} as const;

		if (this.#style === "critters") {
			return new Avatar(Picture.#critters, {
				...options,
				backgroundColor: [],
			}).toString();
		}

		const variant = new Avatar(Picture.#sprouts, options).toJSON().options.plantVariant;
		const top = Picture.#tops.get(String(variant)) ?? defined(Picture.#tops.get("flower"));

		return new Avatar(Picture.#sprouts, {
			...options,
			backgroundColor: [],
			scale: 1,
			translateX: -1.5,
			translateY: -((top + 109.5) / 2 - 50),
		}).toString();
	}
}

export const GET: RequestHandler = ({ params, locals }) => {
	if (!locals.viewer) {
		error(401, "Not signed in");
	}

	if (!["sprouts", "critters"].includes(params.style) || params.seed.length > 64) {
		error(404, "No such avatar");
	}

	return new Response(new Picture(params.style, params.seed).svg, {
		headers: {
			"Cache-Control": "private, max-age=31536000, immutable",
			"Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; sandbox",
			"Content-Type": "image/svg+xml",
			"X-Content-Type-Options": "nosniff",
		},
	});
};
