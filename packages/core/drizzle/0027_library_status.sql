-- The library stores the status a user gives a series; how far they are is
-- still read from their episode progress. Playback history gets its own
-- table, so marking episodes watched no longer shows up as played.
CREATE TYPE "public"."library_status" AS ENUM('planning', 'watching', 'completed', 'dropped');--> statement-breakpoint
ALTER TABLE "watchlist_entry" RENAME TO "library_entry";--> statement-breakpoint
ALTER TABLE "library_entry" RENAME CONSTRAINT "watchlist_entry_user_id_series_id_pk" TO "library_entry_user_id_series_id_pk";--> statement-breakpoint
ALTER TABLE "library_entry" RENAME CONSTRAINT "watchlist_entry_series_id_series_id_fk" TO "library_entry_series_id_series_id_fk";--> statement-breakpoint
ALTER INDEX "watchlist_entry_user_updated_idx" RENAME TO "library_entry_user_updated_idx";--> statement-breakpoint
ALTER TABLE "watchlist_import" RENAME TO "library_import";--> statement-breakpoint
ALTER TABLE "library_import" RENAME CONSTRAINT "watchlist_import_user_id_anilist_id_pk" TO "library_import_user_id_anilist_id_pk";--> statement-breakpoint
ALTER TABLE "playback_progress" RENAME COLUMN "completed" TO "watched";--> statement-breakpoint
ALTER TABLE "library_entry" ADD COLUMN "status" "library_status";--> statement-breakpoint
ALTER TABLE "library_import" ADD COLUMN "status" "library_status";--> statement-breakpoint
-- Keep the status each entry showed until now: dropped as marked, planning
-- before anything was played, completed once every released episode in
-- watch order is watched, and watching otherwise.
WITH "played" AS (
	SELECT DISTINCT "progress"."user_id", "entry"."series_id"
	FROM "playback_progress" AS "progress"
	JOIN "series_entry" AS "entry" ON "entry"."anilist_id" = "progress"."anilist_id"
), "unwatched" AS (
	SELECT DISTINCT "played"."user_id", "played"."series_id"
	FROM "played"
	JOIN "series_season" AS "season" ON "season"."series_id" = "played"."series_id" AND "season"."in_watch_order"
	JOIN "series_episode" AS "episode" ON "episode"."season_id" = "season"."id" AND "episode"."anilist_id" IS NOT NULL
	LEFT JOIN "playback_progress" AS "progress"
		ON "progress"."user_id" = "played"."user_id"
		AND "progress"."anilist_id" = "episode"."anilist_id"
		AND "progress"."episode" = "episode"."anilist_episode"
		AND "progress"."watched"
	WHERE "progress"."user_id" IS NULL
		AND coalesce("episode"."aired_at" <= now(), "episode"."air_date" <= to_char(current_date, 'YYYY-MM-DD'), true)
)
UPDATE "library_entry" AS "library" SET "status" = CASE
	WHEN "library"."dropped_at" IS NOT NULL THEN 'dropped'::"library_status"
	WHEN NOT EXISTS (SELECT 1 FROM "played" WHERE "played"."user_id" = "library"."user_id" AND "played"."series_id" = "library"."series_id") THEN 'planning'::"library_status"
	WHEN EXISTS (SELECT 1 FROM "unwatched" WHERE "unwatched"."user_id" = "library"."user_id" AND "unwatched"."series_id" = "library"."series_id") THEN 'watching'::"library_status"
	ELSE 'completed'::"library_status"
END;--> statement-breakpoint
UPDATE "library_import" AS "imported" SET "status" = CASE
	WHEN "imported"."dropped_at" IS NOT NULL THEN 'dropped'::"library_status"
	WHEN EXISTS (SELECT 1 FROM "playback_progress" AS "progress" WHERE "progress"."user_id" = "imported"."user_id" AND "progress"."anilist_id" = "imported"."anilist_id") THEN 'watching'::"library_status"
	ELSE 'planning'::"library_status"
END;--> statement-breakpoint
ALTER TABLE "library_entry" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "library_import" ALTER COLUMN "status" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "library_entry" DROP COLUMN "dropped_at";--> statement-breakpoint
ALTER TABLE "library_import" DROP COLUMN "dropped_at";--> statement-breakpoint
CREATE TABLE "playback_history" (
	"user_id" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"episode" double precision NOT NULL,
	"position_seconds" double precision NOT NULL,
	"duration_seconds" double precision NOT NULL,
	"played_at" timestamp with time zone NOT NULL,
	CONSTRAINT "playback_history_user_id_anilist_id_episode_pk" PRIMARY KEY("user_id","anilist_id","episode")
);--> statement-breakpoint
CREATE INDEX "playback_history_user_played_idx" ON "playback_history" USING btree ("user_id","played_at");--> statement-breakpoint
-- Marked and imported episodes were saved at their full length; anything
-- short of that was played.
INSERT INTO "playback_history" ("user_id", "anilist_id", "episode", "position_seconds", "duration_seconds", "played_at")
SELECT "user_id", "anilist_id", "episode", "position_seconds", "duration_seconds", "event_at"
FROM "playback_progress"
WHERE "position_seconds" < "duration_seconds";
