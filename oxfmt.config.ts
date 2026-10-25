import { defineConfig } from "oxfmt";
import ultracite from "ultracite/oxfmt";

export default defineConfig({
	...ultracite,
	htmlWhitespaceSensitivity: "ignore",
	ignorePatterns: [
		...ultracite.ignorePatterns,
		"bun.lock",
		"packages/core/drizzle/**",
		"vendor/**",
		"**/*.generated.ts",
	],
	objectWrap: "preserve",
	printWidth: 100,
	semi: true,
	singleQuote: false,
	sortImports: {},
	sortTailwindcss: {
		functions: ["cn", "cva", "clsx"],
		stylesheet: "./apps/web/src/routes/layout.css",
	},
	svelte: true,
	trailingComma: "all",
	useTabs: true,
});
