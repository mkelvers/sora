-- What each profile picks in the player, so later episodes play the same way.
CREATE TABLE "playback_preference" (
	"user_id" text PRIMARY KEY NOT NULL,
	"audio" text,
	"subtitles" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_skip" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
