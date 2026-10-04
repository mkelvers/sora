ALTER TABLE "episode_progress" ADD COLUMN "rewatch" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "episode_progress" DROP CONSTRAINT "episode_progress_user_id_series_id_episode_pk";--> statement-breakpoint
ALTER TABLE "episode_progress" ADD CONSTRAINT "episode_progress_user_id_series_id_episode_rewatch_pk" PRIMARY KEY("user_id","series_id","episode","rewatch");
