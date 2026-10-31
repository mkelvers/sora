ALTER TABLE "provider_episodes" ADD COLUMN "languages" text[] GENERATED ALWAYS AS (array_remove(array[
					case when units @> '[{"languages":["dub"]}]'::jsonb then 'dub' end,
					case when units @> '[{"languages":["sub"]}]'::jsonb then 'sub' end,
					case when units @> '[{"languages":["raw"]}]'::jsonb then 'raw' end
				]::text[], null)) STORED NOT NULL;