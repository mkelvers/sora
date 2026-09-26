-- Profiles choose their avatar. Existing ones keep the one drawn from their ID.
ALTER TABLE "profile" ADD COLUMN "avatar" text;--> statement-breakpoint
UPDATE "profile" SET "avatar" = "id";--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "avatar" SET NOT NULL;
