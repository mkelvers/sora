-- A series is now one AniList entry rather than a franchise grouped by TMDB,
-- and a profile keeps a watchlist of them, each with a status it picks, in
-- place of its Shows, drops, history, and notification marks.
--
-- Every entry of a stored series becomes a series of its own, with the
-- episodes AniList counts for it, and seasons are gone.

ALTER TABLE "series" DROP CONSTRAINT "series_key_unique";--> statement-breakpoint
ALTER TABLE "series" RENAME COLUMN "anchor_anilist_id" TO "anilist_id";--> statement-breakpoint
ALTER TABLE "series" RENAME CONSTRAINT "series_anchor_anilist_id_not_null" TO "series_anilist_id_not_null";--> statement-breakpoint

-- Each entry besides the one its series was anchored to gets a series of its
-- own. It keeps the backdrop, logo, and any chosen artwork of the series that
-- held it when TMDB lists both in one title, and takes its title, cover,
-- dates, and status from what the catalogue stores of the entry. The
-- scheduler lays every series out again, which settles the rest.
INSERT INTO "series" (
	"id", "anilist_id", "key", "kind", "title", "poster_url", "backdrop_url", "logo_url",
	"backdrop_url_override", "logo_url_override", "logo_scale", "logo_offset_x", "logo_offset_y",
	"start_date", "status", "laid_out_at"
)
SELECT
	(
		SELECT string_agg(substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', 1 + floor(random() * 36)::int, 1), '')
		FROM generate_series(1, 9)
		WHERE "entry"."anilist_id" IS NOT NULL
	),
	"entry"."anilist_id",
	"placed"."key",
	"placed"."kind",
	coalesce("indexed"."english", "indexed"."romaji", "indexed"."native", "held"."title"),
	coalesce("stored"."media" -> 'coverImage' ->> 'extraLarge', "stored"."media" -> 'coverImage' ->> 'large'),
	CASE WHEN "placed"."key" = "held"."key" THEN "held"."backdrop_url" ELSE "stored"."media" ->> 'bannerImage' END,
	CASE WHEN "placed"."key" = "held"."key" THEN "held"."logo_url" END,
	CASE WHEN "placed"."key" = "held"."key" THEN "held"."backdrop_url_override" END,
	CASE WHEN "placed"."key" = "held"."key" THEN "held"."logo_url_override" END,
	CASE WHEN "placed"."key" = "held"."key" THEN "held"."logo_scale" ELSE 1 END,
	CASE WHEN "placed"."key" = "held"."key" THEN "held"."logo_offset_x" ELSE 0 END,
	CASE WHEN "placed"."key" = "held"."key" THEN "held"."logo_offset_y" ELSE 0 END,
	"indexed"."start_date",
	"indexed"."status",
	'epoch'
FROM "series_entry" "entry"
INNER JOIN "series" "held" ON "held"."id" = "entry"."series_id"
LEFT JOIN "tmdb_mapping" "mapped" ON "mapped"."anilist_id" = "entry"."anilist_id"
LEFT JOIN "anime_search" "indexed" ON "indexed"."anilist_id" = "entry"."anilist_id"
LEFT JOIN "anime" "stored" ON "stored"."anilist_id" = "entry"."anilist_id"
CROSS JOIN LATERAL (
	SELECT
		CASE
			WHEN "mapped"."tmdb_id" IS NOT NULL AND "mapped"."media_type" = 'tv' THEN 'tv:' || "mapped"."tmdb_id"
			WHEN "mapped"."tmdb_id" IS NOT NULL AND "mapped"."media_type" = 'movie' THEN 'movie:' || "mapped"."tmdb_id"
			ELSE 'anilist:' || "entry"."anilist_id"
		END AS "key",
		CASE
			WHEN "mapped"."tmdb_id" IS NOT NULL AND "mapped"."media_type" = 'tv' THEN 'tv'::"series_kind"
			WHEN "mapped"."tmdb_id" IS NOT NULL AND "mapped"."media_type" = 'movie' THEN 'movie'::"series_kind"
			ELSE 'standalone'::"series_kind"
		END AS "kind"
) "placed"
WHERE "entry"."anilist_id" <> "held"."anilist_id";--> statement-breakpoint

-- A series anchored to an entry had the franchise's artwork, dates, and
-- status; it now has its own entry's.
UPDATE "series"
SET
	"poster_url" = coalesce("stored"."media" -> 'coverImage' ->> 'extraLarge', "stored"."media" -> 'coverImage' ->> 'large', "series"."poster_url"),
	"next_episode_number" = ("stored"."media" -> 'nextAiringEpisode' ->> 'episode')::integer,
	"next_episode_airing_at" = to_timestamp(("stored"."media" -> 'nextAiringEpisode' ->> 'airingAt')::bigint)
FROM "anime" "stored"
WHERE "stored"."anilist_id" = "series"."anilist_id";--> statement-breakpoint
UPDATE "series"
SET "start_date" = "indexed"."start_date", "status" = "indexed"."status"
FROM "anime_search" "indexed"
WHERE "indexed"."anilist_id" = "series"."anilist_id";--> statement-breakpoint

ALTER TABLE "series" ADD CONSTRAINT "series_anilist_id_unique" UNIQUE("anilist_id");--> statement-breakpoint
ALTER TABLE "series" DROP COLUMN "next_episode_season_id";--> statement-breakpoint
CREATE INDEX "series_key_idx" ON "series" USING btree ("key");--> statement-breakpoint

-- Episodes are numbered as AniList numbers their entry's, and belong to the
-- entry's series. Extras only TMDB listed, which nothing streams, are gone.
CREATE TABLE "series_episode_ungrouped" (
	"series_id" text NOT NULL,
	"number" integer NOT NULL,
	"title" text,
	"overview" text,
	"air_date" text,
	"aired_at" timestamp with time zone,
	"runtime_minutes" integer,
	"still_url" text,
	"tmdb_season_number" integer,
	"tmdb_episode_number" integer,
	CONSTRAINT "series_episode_series_id_number_pk" PRIMARY KEY("series_id","number")
);--> statement-breakpoint
INSERT INTO "series_episode_ungrouped"
SELECT DISTINCT ON ("series"."id", "episode"."anilist_episode")
	"series"."id", "episode"."anilist_episode", "episode"."title", "episode"."overview", "episode"."air_date",
	"episode"."aired_at", "episode"."runtime_minutes", "episode"."still_url",
	"episode"."tmdb_season_number", "episode"."tmdb_episode_number"
FROM "series_episode" "episode"
INNER JOIN "series" ON "series"."anilist_id" = "episode"."anilist_id"
WHERE "episode"."anilist_episode" IS NOT NULL
ORDER BY "series"."id", "episode"."anilist_episode";--> statement-breakpoint

-- Progress follows its episode to the series the episode now belongs to.
CREATE TABLE "episode_progress_ungrouped" (
	"user_id" text NOT NULL,
	"series_id" text NOT NULL,
	"episode" integer NOT NULL,
	"position_seconds" integer NOT NULL,
	"duration_seconds" integer NOT NULL,
	"finished" boolean NOT NULL,
	"watched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_at" timestamp with time zone,
	CONSTRAINT "episode_progress_user_id_series_id_episode_pk" PRIMARY KEY("user_id","series_id","episode")
);--> statement-breakpoint
INSERT INTO "episode_progress_ungrouped"
SELECT DISTINCT ON ("progress"."user_id", "series"."id", "episode"."anilist_episode")
	"progress"."user_id", "series"."id", "episode"."anilist_episode", "progress"."position_seconds",
	"progress"."duration_seconds", "progress"."finished", "progress"."watched_at"
FROM "episode_progress" "progress"
INNER JOIN "series_episode" "episode"
	ON "episode"."season_id" = "progress"."season_id" AND "episode"."number" = "progress"."episode"
INNER JOIN "series" ON "series"."anilist_id" = "episode"."anilist_id"
WHERE "episode"."anilist_episode" IS NOT NULL
ORDER BY "progress"."user_id", "series"."id", "episode"."anilist_episode", "progress"."watched_at" DESC;--> statement-breakpoint

-- An episode watched without progress, which marking it watched left, is
-- finished progress now: the watchlist and Continue Watching go by progress.
INSERT INTO "episode_progress_ungrouped"
SELECT DISTINCT ON ("watched"."user_id", "series"."id", "episode"."anilist_episode")
	"watched"."user_id", "series"."id", "episode"."anilist_episode",
	coalesce("episode"."runtime_minutes" * 60, 1440), coalesce("episode"."runtime_minutes" * 60, 1440),
	true, "watched"."finished_at"
FROM "watched_episode" "watched"
INNER JOIN "series_episode" "episode"
	ON "episode"."season_id" = "watched"."season_id" AND "episode"."number" = "watched"."episode"
INNER JOIN "series" ON "series"."anilist_id" = "episode"."anilist_id"
WHERE "episode"."anilist_episode" IS NOT NULL
ORDER BY "watched"."user_id", "series"."id", "episode"."anilist_episode", "watched"."finished_at" DESC
ON CONFLICT DO NOTHING;--> statement-breakpoint

DROP TABLE "episode_progress";--> statement-breakpoint
ALTER TABLE "episode_progress_ungrouped" RENAME TO "episode_progress";--> statement-breakpoint
ALTER TABLE "episode_progress" ADD CONSTRAINT "episode_progress_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "episode_progress_watched_at_idx" ON "episode_progress" USING btree ("user_id","watched_at");--> statement-breakpoint

DROP TABLE "series_episode";--> statement-breakpoint
ALTER TABLE "series_episode_ungrouped" RENAME TO "series_episode";--> statement-breakpoint
ALTER TABLE "series_episode" ADD CONSTRAINT "series_episode_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- The watchlist: for each series in a profile's Shows, every entry of it the
-- profile played or watched anything of, or its first entry when it played
-- none. An entry is completed once its last episode is finished and it has
-- finished airing, dropped when its series was, watching when anything of it
-- was played, and planned otherwise.
CREATE TYPE "public"."watchlist_status" AS ENUM('watching', 'plan_to_watch', 'completed', 'dropped');--> statement-breakpoint
CREATE TABLE "watchlist" (
	"user_id" text NOT NULL,
	"series_id" text NOT NULL,
	"status" "watchlist_status" NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "watchlist_user_id_series_id_pk" PRIMARY KEY("user_id","series_id")
);--> statement-breakpoint
ALTER TABLE "watchlist" ADD CONSTRAINT "watchlist_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "watchlist_updated_at_idx" ON "watchlist" USING btree ("user_id","updated_at");--> statement-breakpoint
INSERT INTO "watchlist" ("user_id", "series_id", "status", "added_at", "updated_at")
SELECT
	"shown"."user_id",
	"entry_series"."id",
	CASE
		WHEN "entry_series"."status" = 'FINISHED' AND EXISTS (
			SELECT 1 FROM "episode_progress" "finale"
			WHERE "finale"."user_id" = "shown"."user_id"
				AND "finale"."series_id" = "entry_series"."id"
				AND "finale"."finished"
				AND "finale"."episode" >= coalesce(
					("stored"."media" ->> 'episodes')::integer,
					(SELECT max("listed"."number") FROM "series_episode" "listed" WHERE "listed"."series_id" = "entry_series"."id")
				)
		) THEN 'completed'::"watchlist_status"
		WHEN "dropped"."series_id" IS NOT NULL THEN 'dropped'::"watchlist_status"
		WHEN "played"."at" IS NOT NULL THEN 'watching'::"watchlist_status"
		ELSE 'plan_to_watch'::"watchlist_status"
	END,
	"shown"."added_at",
	greatest("shown"."added_at", coalesce("played"."at", "shown"."added_at"))
FROM "profile_show" "shown"
INNER JOIN "series_entry" "entry" ON "entry"."series_id" = "shown"."series_id"
INNER JOIN "series" "entry_series" ON "entry_series"."anilist_id" = "entry"."anilist_id"
LEFT JOIN "anime" "stored" ON "stored"."anilist_id" = "entry_series"."anilist_id"
LEFT JOIN "dropped_series" "dropped"
	ON "dropped"."user_id" = "shown"."user_id" AND "dropped"."series_id" = "shown"."series_id"
LEFT JOIN LATERAL (
	SELECT max("progress"."watched_at") AS "at"
	FROM "episode_progress" "progress"
	WHERE "progress"."user_id" = "shown"."user_id" AND "progress"."series_id" = "entry_series"."id"
) "played" ON true
WHERE "played"."at" IS NOT NULL
	OR (
		"entry_series"."id" = "shown"."series_id"
		AND NOT EXISTS (
			SELECT 1
			FROM "series_entry" "sibling"
			INNER JOIN "series" "sibling_series" ON "sibling_series"."anilist_id" = "sibling"."anilist_id"
			INNER JOIN "episode_progress" "progress"
				ON "progress"."series_id" = "sibling_series"."id" AND "progress"."user_id" = "shown"."user_id"
			WHERE "sibling"."series_id" = "shown"."series_id"
		)
	)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- A card taken out of Continue Watching stays out until the profile plays on.
UPDATE "episode_progress" "progress"
SET "dismissed_at" = "shown"."dismissed_at"
FROM "profile_show" "shown"
INNER JOIN "series_entry" "entry" ON "entry"."series_id" = "shown"."series_id"
INNER JOIN "series" "entry_series" ON "entry_series"."anilist_id" = "entry"."anilist_id"
WHERE "progress"."user_id" = "shown"."user_id"
	AND "progress"."series_id" = "entry_series"."id"
	AND "shown"."dismissed_at" IS NOT NULL
	AND "progress"."watched_at" <= "shown"."dismissed_at";--> statement-breakpoint

DROP TABLE "watched_episode";--> statement-breakpoint
DROP TABLE "profile_show";--> statement-breakpoint
DROP TABLE "dropped_series";--> statement-breakpoint
DROP TABLE "notification_read";--> statement-breakpoint
DROP TABLE "notification_dismissal";--> statement-breakpoint

DROP TABLE "series_season";--> statement-breakpoint
DROP TABLE "series_entry";--> statement-breakpoint
DROP TYPE "public"."season_kind";--> statement-breakpoint

-- A series now records the entries AniList relates its own entry to, rather
-- than the franchise's other titles. Those the catalogue stores are filled
-- in here; the scheduler writes them anew as it lays each series out.
DELETE FROM "series_related";--> statement-breakpoint
ALTER TABLE "series_related" ADD COLUMN "relation" text NOT NULL;--> statement-breakpoint
CREATE INDEX "series_related_anilist_idx" ON "series_related" USING btree ("anilist_id");--> statement-breakpoint
INSERT INTO "series_related" ("series_id", "anilist_id", "relation", "position")
SELECT
	"series"."id",
	("edge"."value" -> 'node' ->> 'id')::integer,
	"edge"."value" ->> 'relationType',
	"edge"."ordinality" - 1
FROM "series"
INNER JOIN "anime" "stored" ON "stored"."anilist_id" = "series"."anilist_id"
CROSS JOIN LATERAL jsonb_array_elements("stored"."media" -> 'relations' -> 'edges') WITH ORDINALITY "edge"
WHERE "edge"."value" -> 'node' ->> 'type' = 'ANIME'
	AND "edge"."value" ->> 'relationType' IN (
		'SEQUEL', 'PREQUEL', 'PARENT', 'SIDE_STORY', 'SPIN_OFF', 'ALTERNATIVE', 'SUMMARY', 'COMPILATION', 'CONTAINS', 'OTHER'
	)
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Every series is laid out again from AniList and TMDB, behind the
-- scheduler's other work, which settles what the statements above could
-- only carry over. A series already queued keeps its job and its priority.
UPDATE "series" SET "laid_out_at" = 'epoch';--> statement-breakpoint
DO $$
BEGIN
	IF to_regnamespace('graphile_worker') IS NOT NULL THEN
		PERFORM graphile_worker.add_job(
			'store-series',
			json_build_object('anilistId', "anilist_id"),
			job_key => 'series:' || "anilist_id",
			job_key_mode => 'preserve_run_at',
			priority => 11
		)
		FROM "series"
		WHERE NOT EXISTS (
			SELECT 1 FROM graphile_worker.jobs WHERE jobs.key = 'series:' || "series"."anilist_id"
		);
	END IF;
END $$;
