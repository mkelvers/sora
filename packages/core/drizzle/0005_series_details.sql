ALTER TABLE "series" ADD COLUMN "logo_url" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "status" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "next_episode_season_id" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "next_episode_number" integer;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "next_episode_airing_at" timestamp with time zone;