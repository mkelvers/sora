-- Stored upstream responses: kept for good, and read with a per-request age
-- limit, so expires_at was never read.
ALTER TABLE "anilist_snapshot" RENAME TO "anilist_response";--> statement-breakpoint
ALTER TABLE "anilist_response" RENAME CONSTRAINT "anilist_snapshot_pkey" TO "anilist_response_pkey";--> statement-breakpoint
ALTER TABLE "anilist_response" DROP COLUMN "expires_at";--> statement-breakpoint
-- Responses to operations nothing sends any more.
DELETE FROM "anilist_response" WHERE "operation" NOT IN ('BrowseAnime', 'EpisodeAirings', 'Genres', 'LatestAiring', 'NewEntries', 'SearchIndexPage');--> statement-breakpoint
ALTER TABLE "tmdb_snapshot" RENAME TO "tmdb_response";--> statement-breakpoint
ALTER TABLE "tmdb_response" RENAME CONSTRAINT "tmdb_snapshot_pkey" TO "tmdb_response_pkey";--> statement-breakpoint
ALTER TABLE "tmdb_response" DROP COLUMN "expires_at";--> statement-breakpoint

-- Watchlist status, rewatch, and Continue Watching dismissal: one row per user and series.
CREATE TABLE "series_state" (
	"user_id" text NOT NULL,
	"series_id" text NOT NULL,
	"status" "watchlist_status",
	"added_at" timestamp with time zone,
	"status_changed_at" timestamp with time zone,
	"rewatch_started_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "series_state_user_id_series_id_pk" PRIMARY KEY("user_id","series_id"),
	CONSTRAINT "series_state_watchlist_check" CHECK (("series_state"."status" is null) = ("series_state"."added_at" is null) and ("series_state"."status" is null) = ("series_state"."status_changed_at" is null))
);--> statement-breakpoint
ALTER TABLE "series_state" ADD CONSTRAINT "series_state_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "series_state_status_changed_at_idx" ON "series_state" USING btree ("user_id","status_changed_at");--> statement-breakpoint
INSERT INTO "series_state" ("user_id", "series_id", "status", "added_at", "status_changed_at")
SELECT "user_id", "series_id", "status", "added_at", "updated_at" FROM "watchlist";--> statement-breakpoint
-- A series is out of Continue Watching while the episode played last in it is dismissed.
INSERT INTO "series_state" ("user_id", "series_id", "dismissed_at")
SELECT "user_id", "series_id", "dismissed_at"
FROM (
	SELECT DISTINCT ON ("user_id", "series_id") "user_id", "series_id", "dismissed_at"
	FROM "episode_progress"
	ORDER BY "user_id", "series_id", "watched_at" DESC, "episode" DESC
) AS "latest"
WHERE "dismissed_at" IS NOT NULL
ON CONFLICT ("user_id", "series_id") DO UPDATE SET "dismissed_at" = excluded."dismissed_at";--> statement-breakpoint
DROP TABLE "watchlist";--> statement-breakpoint
ALTER TABLE "episode_progress" DROP COLUMN "dismissed_at";--> statement-breakpoint

-- Images belong to the TMDB title, as the chosen backdrop and logo do.
ALTER TABLE "title_artwork" ADD COLUMN "images_fetched_at" timestamp with time zone;--> statement-breakpoint
CREATE TABLE "title_image" (
	"key" text NOT NULL,
	"type" "image_type" NOT NULL,
	"url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"language" text,
	"vote_average" double precision NOT NULL,
	"vote_count" integer NOT NULL,
	"season_number" integer,
	CONSTRAINT "title_image_key_type_url_pk" PRIMARY KEY("key","type","url")
);--> statement-breakpoint
ALTER TABLE "title_image" ADD CONSTRAINT "title_image_key_title_artwork_key_fk" FOREIGN KEY ("key") REFERENCES "public"."title_artwork"("key") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The latest fetch of each title's images, from whichever of its series made it.
CREATE TEMPORARY TABLE "latest_images" AS
SELECT DISTINCT ON ("images_key") "id", "images_key", "images_fetched_at"
FROM "series"
WHERE "images_key" IS NOT NULL AND "images_fetched_at" IS NOT NULL
ORDER BY "images_key", "images_fetched_at" DESC;--> statement-breakpoint
INSERT INTO "title_artwork" ("key", "images_fetched_at")
SELECT "images_key", "images_fetched_at" FROM "latest_images"
ON CONFLICT ("key") DO UPDATE SET "images_fetched_at" = excluded."images_fetched_at";--> statement-breakpoint
INSERT INTO "title_image" ("key", "type", "url", "width", "height", "language", "vote_average", "vote_count", "season_number")
SELECT "latest_images"."images_key", "type", "url", "width", "height", "language", "vote_average", "vote_count", "season_number"
FROM "series_image"
JOIN "latest_images" ON "latest_images"."id" = "series_image"."series_id";--> statement-breakpoint
DROP TABLE "latest_images";--> statement-breakpoint
DROP TABLE "series_image";--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "images_key";--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "images_fetched_at";
