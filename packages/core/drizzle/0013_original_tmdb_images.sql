-- Backdrops and episode stills now use TMDB's original size instead of
-- w1280 and w300; rewrite the stored URLs to match.
UPDATE "series" SET "backdrop_url" = replace("backdrop_url", 'https://image.tmdb.org/t/p/w1280/', 'https://image.tmdb.org/t/p/original/') WHERE "backdrop_url" LIKE 'https://image.tmdb.org/t/p/w1280/%';--> statement-breakpoint
UPDATE "series_episode" SET "still_url" = replace("still_url", 'https://image.tmdb.org/t/p/w300/', 'https://image.tmdb.org/t/p/original/') WHERE "still_url" LIKE 'https://image.tmdb.org/t/p/w300/%';
