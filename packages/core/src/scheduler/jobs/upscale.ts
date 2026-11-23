import type { Task } from "graphile-worker";
import { z } from "zod";

import { upscaleBackdrop } from "../../series/upscale";
import { parseInput } from "../payload";

/** Upscales the backdrop a viewer asked for; see {@link upscaleBackdrop}. */
export const enlargeBackdrop: Task = async (payload) => {
	await upscaleBackdrop(
		parseInput(
			z.object({
				id: z.uuid(),
			}),
			payload,
		).id,
	);
};
