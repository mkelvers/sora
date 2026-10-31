import { z } from "zod";

import { WatchlistStatusSchema } from "./library";

/** The most titles or episodes one file may hold, so no request is unbounded. */
const maxWatchlist = 20_000;
const maxHistory = 200_000;

export const LibraryExportSchema = z
	.object({
		exported_at: z.string().meta({
			description: "When the file was made, as an ISO 8601 timestamp.",
		}),
		format: z.literal("sora-library"),
		history: z
			.array(
				z.object({
					anilist_id: z.number().int().positive(),
					duration_seconds: z.number().int().nonnegative(),
					episode: z.number().int().positive(),
					finished: z.boolean(),
					position_seconds: z.number().int().nonnegative(),
					rewatch: z.boolean(),
					watched_at: z.string(),
				}),
			)
			.max(maxHistory)
			.meta({
				description: "Every episode the profile played, by AniList entry.",
			}),
		version: z.literal(1),
		watchlist: z
			.array(
				z.object({
					added_at: z.string(),
					anilist_id: z.number().int().positive(),
					status: WatchlistStatusSchema,
					title: z.string().meta({
						description: "For reading the file; an import goes by `anilist_id`.",
					}),
				}),
			)
			.max(maxWatchlist)
			.meta({
				description: "Every title on the profile's watchlist, by AniList entry.",
			}),
	})
	.meta({
		description:
			"A profile's watchlist and history, by AniList ID so it can move between Sora installs.",
		id: "LibraryExport",
	});

export const LibraryImportSchema = z
	.discriminatedUnion("source", [
		z.object({
			document: LibraryExportSchema,
			source: z.literal("sora"),
		}),
		z.object({
			source: z.literal("anilist"),
			username: z.string().trim().min(1).max(100).meta({
				description: "An AniList user whose anime list is public.",
			}),
		}),
		z.object({
			source: z.literal("myanimelist"),
			xml: z.string().min(1).max(20_000_000).meta({
				description: "The text of the `animelist` XML file MyAnimeList exports, unzipped.",
			}),
		}),
	])
	.meta({
		id: "LibraryImport",
	});

export const LibraryImportReportSchema = z
	.object({
		episodes_added: z.number().int().meta({
			description: "Episodes marked watched that were not before.",
		}),
		not_in_sora: z
			.array(
				z.object({
					anilist_id: z.number().int().nullable().meta({
						description: "Null for a MyAnimeList title Sora cannot match to AniList yet.",
					}),
					title: z.string().nullable(),
				}),
			)
			.meta({
				description:
					"Titles Sora does not have yet, the first 50. They are queued to be added, so importing again later picks them up.",
			}),
		not_in_sora_count: z.number().int().meta({
			description: "How many titles Sora does not have yet, `not_in_sora` and beyond.",
		}),
		watchlist_added: z.number().int().meta({
			description: "Titles put on the watchlist.",
		}),
		watchlist_kept: z.number().int().meta({
			description: "Titles already on the watchlist, left as they are.",
		}),
	})
	.meta({
		id: "LibraryImportReport",
	});

export type LibraryExport = z.infer<typeof LibraryExportSchema>;
export type LibraryImport = z.infer<typeof LibraryImportSchema>;
export type LibraryImportReport = z.infer<typeof LibraryImportReportSchema>;
