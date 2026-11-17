CREATE TABLE "anime_trend" (
	"anilist_id" integer NOT NULL,
	"day" text NOT NULL,
	"popularity" integer,
	"trending" integer NOT NULL,
	CONSTRAINT "anime_trend_anilist_id_day_pk" PRIMARY KEY("anilist_id","day")
);
--> statement-breakpoint
ALTER TABLE "anime_trend" ADD CONSTRAINT "anime_trend_anilist_id_anime_search_anilist_id_fk" FOREIGN KEY ("anilist_id") REFERENCES "public"."anime_search"("anilist_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anime_trend_day_idx" ON "anime_trend" USING btree ("day");