CREATE TABLE "series_rating" (
	"rated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"rating" integer NOT NULL,
	"series_id" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "series_rating_user_id_series_id_pk" PRIMARY KEY("user_id","series_id"),
	CONSTRAINT "series_rating_stars_check" CHECK ("series_rating"."rating" between 1 and 5)
);
--> statement-breakpoint
ALTER TABLE "anime_search" ADD COLUMN "score_stars" jsonb;--> statement-breakpoint
ALTER TABLE "series_rating" ADD CONSTRAINT "series_rating_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;