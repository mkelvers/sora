CREATE TABLE "skip_detection" (
	"checked_at" timestamp with time zone NOT NULL,
	"ending_end" real,
	"ending_start" real,
	"key" text PRIMARY KEY NOT NULL,
	"opening_end" real,
	"no_opening" boolean DEFAULT false NOT NULL,
	"opening_start" real,
	"songs" smallint NOT NULL
);
