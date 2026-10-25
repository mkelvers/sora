CREATE TABLE "episode_still" (
	"show_id" integer NOT NULL,
	"season_number" integer NOT NULL,
	"episode_number" integer NOT NULL,
	"path" text,
	"chosen_at" timestamp with time zone NOT NULL,
	CONSTRAINT "episode_still_show_id_season_number_episode_number_pk" PRIMARY KEY("show_id","season_number","episode_number")
);
