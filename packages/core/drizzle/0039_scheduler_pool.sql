CREATE TABLE "scheduler_pool" (
	"pool_id" text PRIMARY KEY NOT NULL,
	"heartbeat_at" timestamp with time zone NOT NULL
);
