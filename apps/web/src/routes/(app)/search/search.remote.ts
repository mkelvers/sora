import { query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const searchSeries = query(
	z.object({
		page: z.number().int().positive().max(500).default(1),
		perPage: z.number().int().min(1).max(50).default(24),
		q: z.string().trim().min(1),
	}),
	({ q, page, perPage }) =>
		remoteViewer().sora.requestWithMeta(route.searchSeries, {
			query: {
				page,
				per_page: perPage,
				q,
			},
		}),
);
