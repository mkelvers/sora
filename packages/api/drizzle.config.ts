import { defineConfig } from "drizzle-kit";

/**
 * Migrations for the API's own tables: Better Auth's, in the `auth` schema.
 * The core migrates its tables separately; each keeps its own history table.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/auth/schema.ts",
  out: "./drizzle",
  schemaFilter: ["auth"],
  migrations: {
    table: "__drizzle_migrations_api",
    schema: "drizzle"
  },
  dbCredentials: {
    url: process.env.DATABASE_URL!
  }
});
