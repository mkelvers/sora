CREATE TABLE "skip_segment_length" (
	"series_id" text NOT NULL,
	"audio" text NOT NULL,
	"kind" text NOT NULL,
	"episode" integer NOT NULL,
	"seconds" double precision NOT NULL,
	CONSTRAINT "skip_segment_length_series_id_audio_kind_episode_pk" PRIMARY KEY("series_id","audio","kind","episode")
);
--> statement-breakpoint
ALTER TABLE "skip_segment_length" ADD CONSTRAINT "skip_segment_length_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;