CREATE TABLE "series_subtitles" (
	"checked_at" timestamp with time zone NOT NULL,
	"languages" text[] NOT NULL,
	"series_id" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "title_facts" (
	"awards" jsonb NOT NULL,
	"certification" text,
	"fetched_at" timestamp with time zone NOT NULL,
	"key" text PRIMARY KEY NOT NULL,
	"wikidata_id" text
);
--> statement-breakpoint
ALTER TABLE "anikoto_series" ADD COLUMN "rating" text;--> statement-breakpoint
ALTER TABLE "series_subtitles" ADD CONSTRAINT "series_subtitles_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;