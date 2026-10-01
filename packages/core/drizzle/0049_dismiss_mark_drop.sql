CREATE TABLE "dropped_series" (
	"user_id" text NOT NULL,
	"series_id" text NOT NULL,
	"dropped_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dropped_series_user_id_series_id_pk" PRIMARY KEY("user_id","series_id")
);
--> statement-breakpoint
ALTER TABLE "profile_show" ADD COLUMN "dismissed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "watched_episode" ADD COLUMN "marked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "dropped_series" ADD CONSTRAINT "dropped_series_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;