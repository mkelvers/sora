CREATE TABLE "catalog_sync" (
	"catalog" text PRIMARY KEY NOT NULL,
	"full_sync_at" timestamp with time zone NOT NULL
);
