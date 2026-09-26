-- Replaces prefixed IDs (a_…, s_…, p_…) of series, seasons, and profiles with
-- generic ones: 9 random characters from 0-9 and A-Z, such as GYZJ43JMR.
-- Every ID is unique across all three, and every reference follows.

-- Let each ID change reach the rows that point at it.
ALTER TABLE "series_entry" DROP CONSTRAINT "series_entry_series_id_series_id_fk";--> statement-breakpoint
ALTER TABLE "series_related" DROP CONSTRAINT "series_related_series_id_series_id_fk";--> statement-breakpoint
ALTER TABLE "series_season" DROP CONSTRAINT "series_season_series_id_series_id_fk";--> statement-breakpoint
ALTER TABLE "watchlist_entry" DROP CONSTRAINT "watchlist_entry_series_id_series_id_fk";--> statement-breakpoint
ALTER TABLE "series_episode" DROP CONSTRAINT "series_episode_season_id_series_season_id_fk";--> statement-breakpoint
ALTER TABLE "series_entry" ADD CONSTRAINT "series_entry_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "series_related" ADD CONSTRAINT "series_related_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "series_season" ADD CONSTRAINT "series_season_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "watchlist_entry" ADD CONSTRAINT "watchlist_entry_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "series_episode" ADD CONSTRAINT "series_episode_season_id_series_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."series_season"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint

CREATE TEMPORARY TABLE "id_change" (
	"old_id" text PRIMARY KEY,
	"new_id" text NOT NULL UNIQUE
);--> statement-breakpoint

DO $$
DECLARE
	alphabet constant text := '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
	old text;
	candidate text;
BEGIN
	FOR old IN
		SELECT "id" FROM "series"
		UNION ALL SELECT "id" FROM "series_season"
		UNION ALL SELECT "id" FROM "profile"
	LOOP
		LOOP
			SELECT string_agg(substr(alphabet, 1 + floor(random() * 36)::int, 1), '')
				INTO candidate
				FROM generate_series(1, 9);
			EXIT WHEN NOT EXISTS (SELECT 1 FROM "id_change" WHERE "new_id" = candidate);
		END LOOP;
		INSERT INTO "id_change" VALUES (old, candidate);
	END LOOP;
END
$$;--> statement-breakpoint

UPDATE "series" SET "id" = c."new_id" FROM "id_change" c WHERE c."old_id" = "series"."id";--> statement-breakpoint
UPDATE "series_season" SET "id" = c."new_id" FROM "id_change" c WHERE c."old_id" = "series_season"."id";--> statement-breakpoint
UPDATE "series" SET "next_episode_season_id" = c."new_id" FROM "id_change" c WHERE c."old_id" = "series"."next_episode_season_id";--> statement-breakpoint
-- Library rows are keyed by profile ID and have no foreign key to it.
UPDATE "playback_progress" SET "user_id" = c."new_id" FROM "id_change" c WHERE c."old_id" = "playback_progress"."user_id";--> statement-breakpoint
UPDATE "watchlist_entry" SET "user_id" = c."new_id" FROM "id_change" c WHERE c."old_id" = "watchlist_entry"."user_id";--> statement-breakpoint
UPDATE "profile" SET "id" = c."new_id" FROM "id_change" c WHERE c."old_id" = "profile"."id";--> statement-breakpoint

DROP TABLE "id_change";--> statement-breakpoint

-- Back to the constraints the schema declares.
ALTER TABLE "series_entry" DROP CONSTRAINT "series_entry_series_id_series_id_fk";--> statement-breakpoint
ALTER TABLE "series_related" DROP CONSTRAINT "series_related_series_id_series_id_fk";--> statement-breakpoint
ALTER TABLE "series_season" DROP CONSTRAINT "series_season_series_id_series_id_fk";--> statement-breakpoint
ALTER TABLE "watchlist_entry" DROP CONSTRAINT "watchlist_entry_series_id_series_id_fk";--> statement-breakpoint
ALTER TABLE "series_episode" DROP CONSTRAINT "series_episode_season_id_series_season_id_fk";--> statement-breakpoint
ALTER TABLE "series_entry" ADD CONSTRAINT "series_entry_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_related" ADD CONSTRAINT "series_related_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_season" ADD CONSTRAINT "series_season_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "watchlist_entry" ADD CONSTRAINT "watchlist_entry_series_id_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_episode" ADD CONSTRAINT "series_episode_season_id_series_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."series_season"("id") ON DELETE cascade ON UPDATE no action;
