-- Watch status and season completion are read from progress from now on.
DROP TABLE "season_completion" CASCADE;--> statement-breakpoint
ALTER TABLE "watchlist_entry" DROP COLUMN "status";--> statement-breakpoint
DROP TYPE "public"."watchlist_status";
