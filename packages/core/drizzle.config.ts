import { defined } from "@sora/shared";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
	dbCredentials: {
		url: defined(process.env.DATABASE_URL),
	},
	dialect: "postgresql",
	out: "./drizzle",
	schema: "./src/database/schema/*.ts",
});
