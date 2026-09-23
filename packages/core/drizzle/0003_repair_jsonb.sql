-- Until now every jsonb value was written as a JSON string holding the
-- serialized value; decode those strings back into the values they hold.
UPDATE "anilist_snapshot" SET "data" = ("data" #>> '{}')::jsonb WHERE jsonb_typeof("data") = 'string';--> statement-breakpoint
UPDATE "tmdb_snapshot" SET "data" = ("data" #>> '{}')::jsonb WHERE jsonb_typeof("data") = 'string';--> statement-breakpoint
UPDATE "anime" SET "media" = ("media" #>> '{}')::jsonb WHERE jsonb_typeof("media") = 'string';--> statement-breakpoint
UPDATE "provider_episodes" SET "units" = ("units" #>> '{}')::jsonb WHERE jsonb_typeof("units") = 'string';--> statement-breakpoint
UPDATE "tmdb_mapping" SET "episodes" = ("episodes" #>> '{}')::jsonb WHERE jsonb_typeof("episodes") = 'string';
