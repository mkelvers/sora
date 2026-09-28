CREATE TYPE "public"."image_type" AS ENUM('poster', 'backdrop', 'logo');--> statement-breakpoint
CREATE TABLE "series_image" (
	"series_id" text NOT NULL,
	"type" "image_type" NOT NULL,
	"url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"language" text,
	"vote_average" double precision NOT NULL,
	"vote_count" integer NOT NULL,
	"season_number" integer,
	CONSTRAINT "series_image_series_id_type_url_pk" PRIMARY KEY("series_id","type","url")
);
--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "images_key" text;--> statement-breakpoint
ALTER TABLE "series" ADD COLUMN "images_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "series_image" ADD CONSTRAINT "series_image_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;