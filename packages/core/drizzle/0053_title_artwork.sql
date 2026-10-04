CREATE TABLE "title_artwork" (
	"key" text PRIMARY KEY NOT NULL,
	"backdrop_url_override" text,
	"logo_url_override" text,
	"logo_scale" double precision DEFAULT 1 NOT NULL,
	"logo_offset_x" double precision DEFAULT 0 NOT NULL,
	"logo_offset_y" double precision DEFAULT 0 NOT NULL
);
--> statement-breakpoint
INSERT INTO "title_artwork" ("key", "backdrop_url_override", "logo_url_override", "logo_scale", "logo_offset_x", "logo_offset_y")
SELECT DISTINCT ON ("key") "key", "backdrop_url_override", "logo_url_override", "logo_scale", "logo_offset_x", "logo_offset_y"
FROM "series"
WHERE "backdrop_url_override" IS NOT NULL
	OR "logo_url_override" IS NOT NULL
	OR "logo_scale" <> 1
	OR "logo_offset_x" <> 0
	OR "logo_offset_y" <> 0
ORDER BY "key", ("backdrop_url_override" IS NULL), ("logo_url_override" IS NULL), "start_date";
--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "backdrop_url_override";--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "logo_url_override";--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "logo_scale";--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "logo_offset_x";--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "logo_offset_y";