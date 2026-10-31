CREATE TABLE "profile_preference" (
	"hide_spoilers" boolean DEFAULT false NOT NULL,
	"notify_dubs" boolean DEFAULT true NOT NULL,
	"notify_episodes" boolean DEFAULT true NOT NULL,
	"notify_premieres" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
ALTER TABLE "playback_preference" ADD COLUMN "autoplay_next" boolean DEFAULT true NOT NULL;