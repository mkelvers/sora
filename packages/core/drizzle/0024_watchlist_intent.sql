-- The watchlist keeps only what the user chose (listed, dropped); how far
-- they are is read from their progress. Dismissals hide a title from
-- "continue watching", and imports wait here until their series is stored.
CREATE TABLE "continue_watching_dismissal" (
	"user_id" text NOT NULL,
	"series_id" text NOT NULL,
	"dismissed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "continue_watching_dismissal_user_id_series_id_pk" PRIMARY KEY("user_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "watchlist_import" (
	"user_id" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"dropped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_import_user_id_anilist_id_pk" PRIMARY KEY("user_id","anilist_id")
);
--> statement-breakpoint
ALTER TABLE "watchlist_entry" ADD COLUMN "dropped_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "continue_watching_dismissal" ADD CONSTRAINT "continue_watching_dismissal_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
UPDATE "watchlist_entry" SET "dropped_at" = "updated_at" WHERE "status" = 'dropped';--> statement-breakpoint
-- Completed seasons kept no episode checkpoints; give every episode up to
-- the finale a completed one, so a season's completion is read from them.
INSERT INTO "playback_progress" ("user_id", "anilist_id", "episode", "position_seconds", "duration_seconds", "completed", "event_at", "updated_at")
SELECT DISTINCT ON ("completion"."user_id", "episode"."anilist_id", "episode"."anilist_episode")
	"completion"."user_id", "episode"."anilist_id", "episode"."anilist_episode",
	coalesce("episode"."runtime_minutes", 24) * 60, coalesce("episode"."runtime_minutes", 24) * 60,
	true, "completion"."completed_at", now()
FROM "season_completion" AS "completion"
JOIN "series_episode" AS "finale"
	ON "finale"."anilist_id" = "completion"."anilist_id" AND "finale"."anilist_episode" = "completion"."episode"
JOIN "series_episode" AS "episode"
	ON "episode"."season_id" = "finale"."season_id" AND "episode"."number" <= "finale"."number" AND "episode"."anilist_id" IS NOT NULL
ON CONFLICT ("user_id", "anilist_id", "episode") DO UPDATE SET
	"position_seconds" = excluded."position_seconds",
	"duration_seconds" = excluded."duration_seconds",
	"completed" = true,
	"event_at" = excluded."event_at",
	"updated_at" = excluded."updated_at"
WHERE "playback_progress"."event_at" < excluded."event_at";
