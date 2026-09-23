CREATE TYPE "public"."season_kind" AS ENUM('season', 'ova', 'movie');--> statement-breakpoint
CREATE TYPE "public"."series_kind" AS ENUM('tv', 'movie', 'standalone');--> statement-breakpoint
CREATE TABLE "series" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"kind" "series_kind" NOT NULL,
	"anchor_anilist_id" integer NOT NULL,
	"title" text NOT NULL,
	"overview" text,
	"poster_url" text,
	"backdrop_url" text,
	"start_date" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"laid_out_at" timestamp with time zone NOT NULL,
	CONSTRAINT "series_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "series_entry" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"series_id" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_episode" (
	"season_id" text NOT NULL,
	"number" integer NOT NULL,
	"anilist_id" integer,
	"anilist_episode" integer,
	"title" text,
	"overview" text,
	"air_date" text,
	"runtime_minutes" integer,
	"still_url" text,
	"tmdb_season_number" integer,
	"tmdb_episode_number" integer,
	CONSTRAINT "series_episode_season_id_number_pk" PRIMARY KEY("season_id","number")
);
--> statement-breakpoint
CREATE TABLE "series_related" (
	"series_id" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "series_related_series_id_anilist_id_pk" PRIMARY KEY("series_id","anilist_id")
);
--> statement-breakpoint
CREATE TABLE "series_season" (
	"id" text PRIMARY KEY NOT NULL,
	"series_id" text NOT NULL,
	"kind" "season_kind" NOT NULL,
	"number" integer NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"anchor_anilist_id" integer
);
--> statement-breakpoint
ALTER TABLE "series_entry" ADD CONSTRAINT "series_entry_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_episode" ADD CONSTRAINT "series_episode_season_id_series_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."series_season"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_related" ADD CONSTRAINT "series_related_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_season" ADD CONSTRAINT "series_season_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "series_entry_series_idx" ON "series_entry" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "series_episode_anilist_idx" ON "series_episode" USING btree ("anilist_id","anilist_episode");--> statement-breakpoint
CREATE INDEX "series_season_series_idx" ON "series_season" USING btree ("series_id","position");