import { query } from "$app/server";
import { remoteViewer } from "$lib/server/sora";
import { route } from "@sora/sdk";
import { z } from "zod";

export const searchSeries = query(
	z.object({
		q: z.string().trim().min(1),
		page: z.number().int().positive().max(500).default(1),
		perPage: z.number().int().min(1).max(50).default(24),
	}),
	({ q, page, perPage }) =>
		remoteViewer().sora.requestWithMeta(route.searchSeries, {
			query: {
				q,
				page,
				per_page: perPage,
			},
		}),
);
