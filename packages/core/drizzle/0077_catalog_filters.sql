CREATE TABLE "anime_search_tag" (
	"adult" boolean NOT NULL,
	"anilist_id" integer NOT NULL,
	"rank" integer NOT NULL,
	"spoiler" boolean NOT NULL,
	"tag" text NOT NULL,
	CONSTRAINT "anime_search_tag_anilist_id_tag_pk" PRIMARY KEY("anilist_id","tag")
);
--> statement-breakpoint
ALTER TABLE "anime_search" ADD COLUMN "country" text;--> statement-breakpoint
ALTER TABLE "anime_search" ADD COLUMN "duration" integer;--> statement-breakpoint
ALTER TABLE "anime_search" ADD COLUMN "episodes" integer;--> statement-breakpoint
ALTER TABLE "anime_search" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "anime_search" ADD COLUMN "studios" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "anime_search_tag" ADD CONSTRAINT "anime_search_tag_anilist_id_anime_search_anilist_id_fk" FOREIGN KEY ("anilist_id") REFERENCES "public"."anime_search"("anilist_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_search_tag_tag_idx" ON "anime_search_tag" USING btree ("tag","rank");--> statement-breakpoint
-- Fill the new columns and tags for every stored entry now rather than at the next weekly full sync.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphile_worker') THEN
		PERFORM graphile_worker.add_job('sync-search-index', '{"full": true}'::json, job_key := 'search-index-catalog-filters', priority := -1);
	END IF;
END $$;
