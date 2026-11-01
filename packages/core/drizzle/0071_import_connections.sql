CREATE TABLE "import_connection" (
	"account_name" text NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "import_connection_user_id_source_pk" PRIMARY KEY("user_id","source")
);
--> statement-breakpoint
CREATE TABLE "import_record" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"episodes" jsonb NOT NULL,
	"id" text NOT NULL,
	"series_ids" jsonb NOT NULL,
	"user_id" text PRIMARY KEY NOT NULL
);
