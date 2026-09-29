CREATE TABLE "episode_release" (
	"anilist_id" integer NOT NULL,
	"anilist_episode" integer NOT NULL,
	"released_at" timestamp with time zone NOT NULL,
	"news" boolean NOT NULL,
	CONSTRAINT "episode_release_anilist_id_anilist_episode_pk" PRIMARY KEY("anilist_id","anilist_episode")
);
--> statement-breakpoint
CREATE TABLE "notification_seen" (
	"user_id" text PRIMARY KEY NOT NULL,
	"seen_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "release_watch" (
	"series_id" text PRIMARY KEY NOT NULL,
	"since" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "release_watch" ADD CONSTRAINT "release_watch_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;