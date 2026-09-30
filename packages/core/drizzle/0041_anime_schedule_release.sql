CREATE TABLE "anime_schedule_release" (
	"route" text NOT NULL,
	"air_type" text NOT NULL,
	"episode" integer NOT NULL,
	"airs_at" timestamp with time zone NOT NULL,
	CONSTRAINT "anime_schedule_release_route_air_type_episode_pk" PRIMARY KEY("route","air_type","episode")
);
--> statement-breakpoint
CREATE INDEX "anime_schedule_release_airs_at_idx" ON "anime_schedule_release" USING btree ("airs_at");