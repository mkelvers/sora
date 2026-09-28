ALTER TABLE "anime_search" ADD COLUMN "score_count" integer;--> statement-breakpoint
-- Fill the new column for every stored entry now rather than at the next weekly full sync.
DO $$
BEGIN
	IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'graphile_worker') THEN
		PERFORM graphile_worker.add_job('sync-search-index', '{"full": true}'::json, job_key := 'search-index-score-count', priority := -1);
	END IF;
END $$;
