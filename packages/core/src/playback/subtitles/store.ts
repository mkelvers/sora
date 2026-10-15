import { createHash } from "node:crypto";

import { day } from "@sora/shared";
import { eq } from "drizzle-orm";

import { db } from "../../database/client";
import { subtitleRefinement } from "../../database/schema";
import type { Refinement } from "./refine";

/** How long after a failed attempt dub and sub are listened to again. */
const retryAfterMs = 7 * day;

/**
 * What identifies one dub and the sub its subtitles come from. Stream URLs
 * expire and hosts rotate, but a stream's path stays the same.
 */
export function refinementKey(subPlaylistUrl: string, dubPlaylistUrl: string) {
	return createHash("sha256")
		.update(`${new URL(dubPlaylistUrl).pathname}\n${new URL(subPlaylistUrl).pathname}`)
		.digest("hex")
		.slice(0, 32);
}

/** What is stored for a pair, or `null` when it was never tried. */
export async function getRefinement(key: string) {
	const [row] = await db
		.select()
		.from(subtitleRefinement)
		.where(eq(subtitleRefinement.key, key))
		.limit(1);
	if (!row) {
		return null;
	}

	return {
		/** `null` when the speech did not match the sub's script. */
		refinement:
			row.shifts && row.anchors
				? {
						shifts: row.shifts,
						anchors: row.anchors,
					}
				: null,
		attemptedAt: row.attemptedAt,
	};
}

/** Whether a pair has not been listened to, or failed long enough ago to try again. */
export function isRefinementDue(stored: Awaited<ReturnType<typeof getRefinement>>) {
	return (
		!stored || (!stored.refinement && Date.now() - stored.attemptedAt.getTime() >= retryAfterMs)
	);
}

/** Stores what listening found for a pair; `null` records that the speech did not match. */
export async function saveRefinement(key: string, refinement: Refinement | null) {
	const row = {
		shifts: refinement?.shifts ?? null,
		anchors: refinement?.anchors ?? null,
		attemptedAt: new Date(),
	};
	await db
		.insert(subtitleRefinement)
		.values({
			key,
			...row,
		})
		.onConflictDoUpdate({
			target: subtitleRefinement.key,
			set: row,
		});
}
