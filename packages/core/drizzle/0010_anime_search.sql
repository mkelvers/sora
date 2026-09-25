-- Trigram matching for search; trusted, so the database owner may enable it.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TABLE "anime_search" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"english" text,
	"romaji" text,
	"native" text,
	"synonyms" jsonb NOT NULL,
	"search_text" text NOT NULL,
	"format" text,
	"status" text,
	"season" text,
	"season_year" integer,
	"start_date" text,
	"genres" jsonb NOT NULL,
	"popularity" integer NOT NULL,
	"trending" integer NOT NULL,
	"average_score" integer,
	"is_adult" boolean NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "anime_search_text_idx" ON "anime_search" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "anime_search_updated_at_idx" ON "anime_search" USING btree ("updated_at");