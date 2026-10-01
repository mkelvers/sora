CREATE TABLE "episode_progress" (
	"user_id" text NOT NULL,
	"season_id" text NOT NULL,
	"episode" integer NOT NULL,
	"position_seconds" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"finished" boolean NOT NULL,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "episode_progress_user_id_season_id_episode_pk" PRIMARY KEY("user_id","season_id","episode")
);
--> statement-breakpoint
ALTER TABLE "episode_progress" ADD CONSTRAINT "episode_progress_season_id_series_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."series_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episode_progress_watched_at_idx" ON "episode_progress" USING btree ("user_id","watched_at");