-- Gogoanime and Goyabu are no longer stream providers; drop what was stored
-- about them. Neither ever matched an anime, so only failed matches remain.
DELETE FROM "provider_mapping" WHERE "provider" IN ('gogoanime', 'goyabu');--> statement-breakpoint
DELETE FROM "provider_episodes" WHERE "provider" IN ('gogoanime', 'goyabu');
