CREATE TABLE "subtitle_refinement" (
	"key" text PRIMARY KEY NOT NULL,
	"shifts" jsonb,
	"anchors" jsonb,
	"attempted_at" timestamp with time zone NOT NULL
);
