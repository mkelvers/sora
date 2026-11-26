---
name: database-migrations
description: Use when touching the database schema, migrations or db:migrate.
---

# Database migrations

Keep the shared dev database matching the checkout you're working in, so that `db:migrate` just runs. When it doesn't, find out why, tell the user, and repair it only once they say how.

Every worktree uses the same local database, `sora`, but each worktree can be at a different stage: one on main, one with a draft migration, one on an old branch. A migration that one of them applies is applied for all of them. Drizzle only applies files newer than the newest one it has recorded and never re-reads a file it has run, so the database can quietly drift from what a checkout expects. `bun run db:migrate` (in `packages/core`, and before every `bun dev`) checks for that and refuses instead of letting queries fail later.

Stay passive. Tell the user what you ran, what it said and what you think it means. Never write to the database, delete a migration record, regenerate a migration or pick between fixes without their go-ahead. They know which worktree is doing what; you don't.

## 1. Migrate when the checkout changes

After pulling, merging main or switching worktrees, run `bun run db:migrate` and report the result: which migrations applied, or that it refused and why. When it applies cleanly you're done.

## 2. When it refuses, diagnose read-only

The error names one of three problems, and lists the migrations or columns involved:

- **History mismatch** ("would skip migrations without saying so"). A recorded migration was applied as a different version of its file, or a file was never applied although a newer one was. Usually a migration that was edited or regenerated after it ran.
- **Missing tables or columns.** Another worktree's migration, or a draft that was later dropped, renamed or removed something this checkout uses. The error lists the recorded migrations this checkout has no file for; those are the suspects.
- **Refused `.sql` queries.** Either the query is wrong, or the database differs from this checkout's migrations.

Inspect without changing anything:

```sh
docker exec sora psql -U sora -d sora -c '\d <table>'
docker exec sora psql -U sora -d sora -c 'select id, hash, created_at from drizzle.__drizzle_migrations order by created_at'
shasum -a 256 packages/core/drizzle/<file>.sql
```

Find which branch or worktree the foreign migrations came from (`git log --all -- packages/core/drizzle`, `git worktree list`).

## 3. Report and propose

Tell the user what is wrong, where it came from, and the fix you suggest, as the exact statements you would run. The usual fixes:

- Bring the database in line with the file by hand, then set the recorded hash to the file's.
- Undo what a foreign or dropped migration changed, then delete its row from `drizzle.__drizzle_migrations`.

Then wait. If another worktree still needs that migration, undoing it breaks that worktree, and only the user knows. Never skip or weaken the checks in `migration-history.ts` or `schema-check.ts` to get past a refusal: they're what keeps the drift from surfacing as failing queries in production.

## 4. Apply, then rerun

Once the user agrees, run the statements, rerun `bun run db:migrate`, and report the result.

## Changing the schema

Edit `packages/core/src/database/schema/` and run `bun run db:generate`; never write or edit a migration by hand, because its snapshot and journal must match it. Don't edit a migration once it has run anywhere: Drizzle won't run it again, so the change never lands. Make a new one.

Before running a new migration, read the SQL it generated and check it does only what the schema change meant. Every worktree shares `sora`, so whatever it does lands in all of them. Tell the user what it will change. If it drops or renames a table or column, changes a type in a way that can lose data, or adds a `not null` column without a default to a table that has rows, stop and ask first, since that can break the other worktrees or lose data. Then run `bun run db:migrate` and report the result.

If a branch whose migration already ran on `sora` is dropped, tell the user, and propose how to undo it before you finish.

Before merging, make sure the branch's migrations are newer than every one on main. If main gained a newer one, tell the user and regenerate yours once they agree, or Drizzle will skip yours.

## Before you finish

- The user has heard what ran, what it reported, and every change you made.
- Nothing was written to the database without their go-ahead.
- `bun run db:migrate` runs cleanly in this checkout, or the user knows why it doesn't.
