CREATE TYPE "public"."watchlist_status" AS ENUM('watching', 'planning', 'completed', 'paused', 'dropped');--> statement-breakpoint
CREATE TABLE "anilist_snapshot" (
	"key" text PRIMARY KEY NOT NULL,
	"operation" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "playback_progress" (
	"user_id" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"episode" double precision NOT NULL,
	"position_seconds" double precision NOT NULL,
	"duration_seconds" double precision NOT NULL,
	"completed" boolean NOT NULL,
	"event_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playback_progress_user_id_anilist_id_episode_pk" PRIMARY KEY("user_id","anilist_id","episode")
);
--> statement-breakpoint
CREATE TABLE "provider_episodes" (
	"anilist_id" integer NOT NULL,
	"provider" text NOT NULL,
	"units" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_episodes_anilist_id_provider_pk" PRIMARY KEY("anilist_id","provider")
);
--> statement-breakpoint
CREATE TABLE "provider_mapping" (
	"anilist_id" integer NOT NULL,
	"provider" text NOT NULL,
	"provider_media_id" text,
	"matched_title" text,
	"method" text,
	"resolved_at" timestamp with time zone NOT NULL,
	CONSTRAINT "provider_mapping_anilist_id_provider_pk" PRIMARY KEY("anilist_id","provider")
);
--> statement-breakpoint
CREATE TABLE "watchlist_entry" (
	"user_id" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"status" "watchlist_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_entry_user_id_anilist_id_pk" PRIMARY KEY("user_id","anilist_id")
);
--> statement-breakpoint
CREATE INDEX "anilist_snapshot_expires_idx" ON "anilist_snapshot" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "playback_progress_user_event_idx" ON "playback_progress" USING btree ("user_id","event_at");--> statement-breakpoint
CREATE INDEX "watchlist_entry_user_updated_idx" ON "watchlist_entry" USING btree ("user_id","updated_at");