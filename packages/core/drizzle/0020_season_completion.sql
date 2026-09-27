-- Seasons a profile has watched to the end; see `season_completion` in the schema.
CREATE TABLE "season_completion" (
	"user_id" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"episode" double precision NOT NULL,
	"completed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "season_completion_user_id_anilist_id_episode_pk" PRIMARY KEY("user_id","anilist_id","episode")
);
