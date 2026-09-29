CREATE TABLE "featured_pick" (
	"user_id" text NOT NULL,
	"rotation" integer NOT NULL,
	"series_id" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "featured_pick_user_id_rotation_series_id_pk" PRIMARY KEY("user_id","rotation","series_id")
);
--> statement-breakpoint
ALTER TABLE "featured_pick" ADD CONSTRAINT "featured_pick_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;