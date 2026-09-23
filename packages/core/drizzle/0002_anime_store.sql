CREATE TABLE "anime" (
	"anilist_id" integer PRIMARY KEY NOT NULL,
	"media" jsonb NOT NULL,
	"status" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"refreshed_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "anime_status_idx" ON "anime" USING btree ("status");--> statement-breakpoint
-- Episode lists were refreshed on a timer until now; a list stored while an
-- anime was airing may be incomplete and would now be served forever.
DELETE FROM "provider_episodes";