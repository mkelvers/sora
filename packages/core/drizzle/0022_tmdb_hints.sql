CREATE TABLE "tmdb_hint" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"show_id" integer,
	"movie_ids" integer[] NOT NULL
);
