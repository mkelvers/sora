CREATE TABLE "notification_dismissal" (
	"user_id" text NOT NULL,
	"notification_id" text NOT NULL,
	"dismissed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "notification_dismissal_user_id_notification_id_pk" PRIMARY KEY("user_id","notification_id")
);
