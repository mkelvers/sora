-- Units stored before filler was tracked have no "isFiller" key, so they fail
-- the unit schema and are dropped, leaving their episodes' audio unknown. None
-- of them came from AniKoto, the only provider that reports filler, so fill in
-- null: what a fresh lookup stores for these providers.
UPDATE "provider_episodes" SET "units" = (
	SELECT jsonb_agg(CASE WHEN "unit" ? 'isFiller' THEN "unit" ELSE "unit" || '{"isFiller": null}'::jsonb END ORDER BY "position")
	FROM jsonb_array_elements("units") WITH ORDINALITY AS "element"("unit", "position")
) WHERE EXISTS (SELECT 1 FROM jsonb_array_elements("units") AS "element"("unit") WHERE NOT "unit" ? 'isFiller');
