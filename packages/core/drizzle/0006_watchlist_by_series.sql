-- The watchlist holds titles (series) instead of AniList entries.
ALTER TABLE "watchlist_entry" ADD COLUMN "series_id" text;--> statement-breakpoint
UPDATE "watchlist_entry" AS "entry"
SET "series_id" = "stored"."series_id"
FROM "series_entry" AS "stored"
WHERE "stored"."anilist_id" = "entry"."anilist_id";--> statement-breakpoint
-- An anime no stored series contains cannot be shown as a title.
DELETE FROM "watchlist_entry" WHERE "series_id" IS NULL;--> statement-breakpoint
-- Several entries of one title collapse into the most recently changed one.
DELETE FROM "watchlist_entry" AS "older"
USING "watchlist_entry" AS "newer"
WHERE "older"."user_id" = "newer"."user_id"
  AND "older"."series_id" = "newer"."series_id"
  AND ("older"."updated_at", "older"."anilist_id") < ("newer"."updated_at", "newer"."anilist_id");--> statement-breakpoint
ALTER TABLE "watchlist_entry" DROP CONSTRAINT "watchlist_entry_user_id_anilist_id_pk";--> statement-breakpoint
ALTER TABLE "watchlist_entry" DROP COLUMN "anilist_id";--> statement-breakpoint
ALTER TABLE "watchlist_entry" ALTER COLUMN "series_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "watchlist_entry" ADD CONSTRAINT "watchlist_entry_user_id_series_id_pk" PRIMARY KEY("user_id","series_id");--> statement-breakpoint
ALTER TABLE "watchlist_entry" ADD CONSTRAINT "watchlist_entry_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;
