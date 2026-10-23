ALTER TABLE "auth_user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "auth_user" ADD COLUMN "display_username" text;--> statement-breakpoint
UPDATE "auth_user" SET "username" = 'mkelvers' WHERE "email" = 'mikkelelvers@outlook.com';--> statement-breakpoint
UPDATE "auth_user" SET "username" = coalesce(nullif(trim(both '_' from regexp_replace(lower("name"), '[^a-z0-9_.]+', '_', 'g')), ''), 'user')
WHERE "username" IS NULL;--> statement-breakpoint
UPDATE "auth_user" SET "username" = left("username", 30);--> statement-breakpoint
UPDATE "auth_user" SET "username" = "username" || '_' || lower(substr("id", 1, 6)) WHERE length("username") < 3;--> statement-breakpoint
UPDATE "auth_user" u SET "username" = left(u."username", 23) || '_' || lower(substr(u."id", 1, 6))
WHERE u."email" <> 'mikkelelvers@outlook.com'
AND EXISTS (SELECT 1 FROM "auth_user" o WHERE o."username" = u."username" AND o."id" <> u."id");--> statement-breakpoint
UPDATE "auth_user" SET "display_username" = "username", "email" = "username" || '@sora.invalid';--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_user" ALTER COLUMN "display_username" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "auth_user" ADD CONSTRAINT "auth_user_username_unique" UNIQUE("username");
