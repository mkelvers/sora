-- Seasons stored before watch order was tracked: regular seasons and films
-- were in it, OVA seasons were extras. Every series is laid out again after
-- this migration, which places films and OVAs that continue the story.
ALTER TABLE "series_season" ADD COLUMN "in_watch_order" boolean;
--> statement-breakpoint
UPDATE "series_season" SET "in_watch_order" = "kind" <> 'ova';
--> statement-breakpoint
ALTER TABLE "series_season" ALTER COLUMN "in_watch_order" SET NOT NULL;
