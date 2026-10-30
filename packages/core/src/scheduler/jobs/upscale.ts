import type { Task } from "graphile-worker";
import { z } from "zod";

import { upscaleBackdrop } from "../../series/upscale";

const PayloadSchema = z.object({
	id: z.uuid(),
});

/** Upscales the backdrop a viewer asked for; see {@link upscaleBackdrop}. */
export const upscaleBackdropJob: Task = async (payload) => {
	await upscaleBackdrop(PayloadSchema.parse(payload).id);
};
