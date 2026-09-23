CREATE TYPE "public"."tmdb_media_type" AS ENUM('tv', 'movie');--> statement-breakpoint
CREATE TABLE "tmdb_snapshot" (
	"key" text PRIMARY KEY NOT NULL,
	"path" text NOT NULL,
	"data" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tmdb_mapping" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"media_type" "tmdb_media_type",
	"tmdb_id" integer,
	"season_number" integer,
	"episode_number" integer,
	"episodes" jsonb NOT NULL,
	"method" text,
	"score" double precision,
	"resolved_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "tmdb_snapshot_expires_idx" ON "tmdb_snapshot" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "tmdb_mapping_target_idx" ON "tmdb_mapping" USING btree ("media_type","tmdb_id");