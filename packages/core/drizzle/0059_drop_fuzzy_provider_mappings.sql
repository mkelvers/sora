-- Title-search mappings were kept without checking the season or the length of
-- the provider's list, so some point at another season, or at a whole series
-- standing in for a special. They are found again on the next play, under the checks.
DELETE FROM "provider_episodes" USING "provider_mapping"
WHERE "provider_episodes"."anilist_id" = "provider_mapping"."anilist_id"
  AND "provider_episodes"."provider" = "provider_mapping"."provider"
  AND "provider_mapping"."method" = 'fuzzy';--> statement-breakpoint
DELETE FROM "provider_mapping" WHERE "method" = 'fuzzy';
