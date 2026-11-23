import type { Task } from "graphile-worker";
import { z } from "zod";

import { upscales } from "../../series/upscale";
import { parseInput } from "../payload";

/** Upscales the backdrop a viewer asked for; see {@link upscales.run}. */
export const enlargeBackdrop: Task = async (payload) => {
	await upscales.run(
		parseInput(
			z.object({
				id: z.uuid(),
			}),
			payload,
		).id,
	);
};
