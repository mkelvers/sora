CREATE TABLE "provider_calls" (
	"provider" text NOT NULL,
	"operation" text NOT NULL,
	"hour" timestamp with time zone NOT NULL,
	"ok" integer DEFAULT 0 NOT NULL,
	"empty" integer DEFAULT 0 NOT NULL,
	"failed" integer DEFAULT 0 NOT NULL,
	"duration_ms" bigint DEFAULT 0 NOT NULL,
	"last_error" text,
	"last_error_at" timestamp with time zone,
	CONSTRAINT "provider_calls_provider_operation_hour_pk" PRIMARY KEY("provider","operation","hour")
);
--> statement-breakpoint
CREATE INDEX "provider_calls_hour_idx" ON "provider_calls" USING btree ("hour");