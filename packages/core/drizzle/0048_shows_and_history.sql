CREATE TABLE "profile_show" (
	"user_id" text NOT NULL,
	"series_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "profile_show_user_id_series_id_pk" PRIMARY KEY("user_id","series_id")
);
--> statement-breakpoint
CREATE TABLE "watched_episode" (
	"user_id" text NOT NULL,
	"season_id" text NOT NULL,
	"episode" integer NOT NULL,
	"finished_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watched_episode_user_id_season_id_episode_pk" PRIMARY KEY("user_id","season_id","episode")
);
--> statement-breakpoint
ALTER TABLE "profile_show" ADD CONSTRAINT "profile_show_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watched_episode" ADD CONSTRAINT "watched_episode_season_id_series_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."series_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watched_episode_finished_at_idx" ON "watched_episode" USING btree ("user_id","finished_at");--> statement-breakpoint
INSERT INTO "watched_episode" ("user_id", "season_id", "episode", "finished_at")
SELECT "user_id", "season_id", "episode", "watched_at" FROM "episode_progress" WHERE "finished";
--> statement-breakpoint
INSERT INTO "profile_show" ("user_id", "series_id", "added_at")
SELECT "episode_progress"."user_id", "series_season"."series_id", min("episode_progress"."watched_at")
FROM "episode_progress"
INNER JOIN "series_season" ON "series_season"."id" = "episode_progress"."season_id"
GROUP BY "episode_progress"."user_id", "series_season"."series_id";
