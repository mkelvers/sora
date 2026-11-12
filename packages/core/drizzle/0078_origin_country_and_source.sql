ALTER TABLE "anime_search" ADD COLUMN "origin_country" text;--> statement-breakpoint
ALTER TABLE "anime_search" ADD COLUMN "origin_source" text;--> statement-breakpoint
-- Fill the new columns for every stored entry now rather than at the next weekly full sync.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphile_worker') THEN
		PERFORM graphile_worker.add_job('sync-search-index', '{"full": true}'::json, job_key := 'search-index-origin', priority := -1);
	END IF;
END $$;
