CREATE TABLE "anikoto_series" (
	"anikoto_id" integer PRIMARY KEY NOT NULL,
	"anilist_id" integer,
	"mal_id" integer,
	"title" text NOT NULL,
	"titles" jsonb NOT NULL,
	"format" text,
	"year" integer,
	"episodes" integer,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "anikoto_series_anilist_id_idx" ON "anikoto_series" USING btree ("anilist_id");--> statement-breakpoint
CREATE INDEX "anikoto_series_mal_id_idx" ON "anikoto_series" USING btree ("mal_id");--> statement-breakpoint
-- AniKoto matches are now made by ID against this catalogue. Title matches
-- sent unreleased sequels to an earlier season's episodes, so they and the
-- episode lists fetched through them are dropped and matched again.
DELETE FROM "provider_mapping" WHERE "provider" = 'anikoto';--> statement-breakpoint
DELETE FROM "provider_episodes" WHERE "provider" = 'anikoto';