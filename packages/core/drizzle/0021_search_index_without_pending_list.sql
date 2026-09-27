ALTER INDEX "anime_search_text_idx" SET (fastupdate = false);--> statement-breakpoint
SELECT gin_clean_pending_list('anime_search_text_idx');
