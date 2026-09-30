-- Forgetting an episode used to delete its history but keep its progress.
-- Playback always writes history, so an unwatched checkpoint without any is
-- one of those leftovers; watched ones may come from marking and stay.
DELETE FROM "playback_progress" AS "progress"
WHERE NOT "progress"."watched"
	AND NOT EXISTS (
		SELECT 1 FROM "playback_history" AS "history"
		WHERE "history"."user_id" = "progress"."user_id"
			AND "history"."anilist_id" = "progress"."anilist_id"
			AND "history"."episode" = "progress"."episode"
	);
