WITH "cuts" AS (
	SELECT "listed"."anilist_id", "listed"."provider", min("listed"."number") AS "first_stray"
	FROM (
		SELECT
			"p"."anilist_id",
			"p"."provider",
			"a"."total",
			(u."unit" ->> 'number')::numeric AS "number",
			lag((u."unit" ->> 'number')::numeric) OVER (
				PARTITION BY "p"."anilist_id", "p"."provider"
				ORDER BY (u."unit" ->> 'number')::numeric
			) AS "previous"
		FROM "provider_episodes" "p"
		INNER JOIN (
			SELECT "anilist_id", ("media" ->> 'episodes')::numeric AS "total"
			FROM "anime"
			WHERE "status" = 'FINISHED' AND "media" ->> 'episodes' IS NOT NULL
		) "a" ON "a"."anilist_id" = "p"."anilist_id"
		CROSS JOIN LATERAL jsonb_array_elements("p"."units") AS u("unit")
		WHERE jsonb_typeof("p"."units") = 'array'
	) "listed"
	WHERE "listed"."number" > "listed"."total"
		AND "listed"."number" - coalesce("listed"."previous", 0) > 10
	GROUP BY "listed"."anilist_id", "listed"."provider"
),
"trimmed" AS (
	UPDATE "provider_episodes" "p"
	SET "units" = coalesce(
		(
			SELECT jsonb_agg("u"."unit" ORDER BY "u"."position")
			FROM jsonb_array_elements("p"."units") WITH ORDINALITY AS u("unit", "position")
			WHERE (u."unit" ->> 'number')::numeric < "cuts"."first_stray"
		),
		'[]'::jsonb
	)
	FROM "cuts"
	WHERE "p"."anilist_id" = "cuts"."anilist_id" AND "p"."provider" = "cuts"."provider"
	RETURNING "p"."anilist_id"
),
"stale_layout" AS (
	DELETE FROM "series_episode" "e"
	USING "series" "s", "cuts"
	WHERE "e"."series_id" = "s"."id"
		AND "s"."anilist_id" = "cuts"."anilist_id"
		AND "e"."number" >= "cuts"."first_stray"
	RETURNING "e"."series_id"
)
DELETE FROM "episode_dub" "d"
USING "cuts"
WHERE "d"."anilist_id" = "cuts"."anilist_id" AND "d"."episode" >= "cuts"."first_stray";
