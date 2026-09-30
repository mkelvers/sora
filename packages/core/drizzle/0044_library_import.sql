CREATE TABLE "library_import" (
	"user_id" text NOT NULL,
	"anilist_id" integer NOT NULL,
	"status" "library_status" NOT NULL,
	"added_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "library_import_user_id_anilist_id_pk" PRIMARY KEY("user_id","anilist_id")
);
--> statement-breakpoint
CREATE INDEX "library_import_anilist_idx" ON "library_import" USING btree ("anilist_id");