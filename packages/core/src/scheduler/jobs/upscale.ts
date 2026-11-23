import type { Task } from "graphile-worker";
import { z } from "zod";

import { upscaleBackdrop } from "../../series/upscale";
import { parsePayload } from "../payload";

/** Upscales the backdrop a viewer asked for; see {@link upscaleBackdrop}. */
export const upscaleBackdropJob: Task = async (payload) => {
	await upscaleBackdrop(
		parsePayload(
			z.object({
				id: z.uuid(),
			}),
			payload,
		).id,
	);
};
