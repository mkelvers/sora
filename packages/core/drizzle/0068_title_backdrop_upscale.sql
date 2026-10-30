CREATE TABLE "title_backdrop_upscale" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"failure" text,
	"height" integer,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"image" "bytea",
	"key" text NOT NULL,
	"source_url" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"width" integer,
	CONSTRAINT "title_backdrop_upscale_source_idx" UNIQUE("key","source_url")
);
--> statement-breakpoint
ALTER TABLE "title_backdrop_upscale" ADD CONSTRAINT "title_backdrop_upscale_key_title_artwork_key_fk" FOREIGN KEY ("key") REFERENCES "public"."title_artwork"("key") ON DELETE cascade ON UPDATE no action;