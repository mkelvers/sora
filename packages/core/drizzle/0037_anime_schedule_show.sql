CREATE TABLE "anime_schedule_show" (
	"route" text PRIMARY KEY NOT NULL,
	"anilist_id" integer,
	"resolved_at" timestamp with time zone NOT NULL
);
