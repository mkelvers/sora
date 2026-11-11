ALTER TABLE "title_facts" ADD COLUMN "descriptors" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "title_facts" ADD COLUMN "keywords" text[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Facts stored before keywords and descriptors are fetched again on the job's next runs.
UPDATE "title_facts" SET "fetched_at" = 'epoch';
