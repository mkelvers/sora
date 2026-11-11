ALTER TABLE "title_facts" DROP COLUMN "wikidata_id";--> statement-breakpoint
ALTER TABLE "title_facts" ADD COLUMN "imdb_id" text;--> statement-breakpoint
-- Awards now come from IMDb: every title's facts are fetched again on the job's next runs.
UPDATE "title_facts" SET "fetched_at" = 'epoch', "awards" = '[]';
