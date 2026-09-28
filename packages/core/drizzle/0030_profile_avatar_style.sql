-- Avatars come in more than one style. Existing ones were all drawn as sprouts.
CREATE TYPE "public"."avatar_style" AS ENUM('sprouts', 'critters');--> statement-breakpoint
ALTER TABLE "profile" RENAME COLUMN "avatar" TO "avatar_seed";--> statement-breakpoint
ALTER TABLE "profile" ADD COLUMN "avatar_style" "avatar_style" DEFAULT 'sprouts' NOT NULL;--> statement-breakpoint
ALTER TABLE "profile" ALTER COLUMN "avatar_style" DROP DEFAULT;
