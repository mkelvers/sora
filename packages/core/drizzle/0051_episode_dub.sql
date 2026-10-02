CREATE TABLE "episode_dub" (
	"anilist_id" integer NOT NULL,
	"episode" integer NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "episode_dub_anilist_id_episode_pk" PRIMARY KEY("anilist_id","episode")
);
--> statement-breakpoint
CREATE INDEX "episode_dub_released_at_idx" ON "episode_dub" USING btree ("released_at");--> statement-breakpoint
-- Every dub AniKoto's stored lists carry already. Those AnimeSchedule's
-- timetable has came out when it says; nobody saw the rest come out.
INSERT INTO "episode_dub" ("anilist_id", "episode", "released_at")
SELECT
	listed."anilist_id",
	(unit->>'number')::int,
	(
		SELECT min(release."airs_at")
		FROM "anime_schedule_release" release
		INNER JOIN "anime_schedule_show" show ON show."route" = release."route"
		WHERE show."anilist_id" = listed."anilist_id"
			AND release."air_type" = 'dub'
			AND release."episode" = (unit->>'number')::int
			AND release."airs_at" <= now()
	)
FROM "provider_episodes" listed
CROSS JOIN LATERAL jsonb_array_elements(listed."units") unit
WHERE listed."provider" = 'anikoto'
	AND jsonb_typeof(unit->'languages') = 'array'
	AND unit->'languages' @> '["dub"]'::jsonb
	AND (unit->>'number')::numeric % 1 = 0
ON CONFLICT DO NOTHING;
