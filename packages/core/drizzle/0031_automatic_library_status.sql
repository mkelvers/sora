-- Library statuses follow progress now: `dropped` goes, and the AniList
-- import, the only thing that staged entries in library_import, is removed.
DROP TABLE "library_import" CASCADE;--> statement-breakpoint
ALTER TABLE "library_entry" ALTER COLUMN "status" SET DATA TYPE text;--> statement-breakpoint
-- Dropped titles become watching; reading the library settles each one to
-- what its progress calls for (completed, or planning when nothing was played).
UPDATE "library_entry" SET "status" = 'watching' WHERE "status" = 'dropped';--> statement-breakpoint
DROP TYPE "public"."library_status";--> statement-breakpoint
CREATE TYPE "public"."library_status" AS ENUM('planning', 'watching', 'completed');--> statement-breakpoint
ALTER TABLE "library_entry" ALTER COLUMN "status" SET DATA TYPE "public"."library_status" USING "status"::"public"."library_status";
