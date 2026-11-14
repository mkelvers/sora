import { defineConfig } from "oxlint";
import core from "ultracite/oxlint/core";
import svelte from "ultracite/oxlint/svelte";

export default defineConfig({
	categories: {
		correctness: "error",
	},
	env: {
		...core.env,
		browser: true,
		es2024: true,
		node: true,
	},
	extends: [core, svelte],
	ignorePatterns: [
		...core.ignorePatterns,
		"packages/core/drizzle/**",
		"vendor/**",
		"**/*.generated.ts",
		"**/.svelte-kit/**",
	],
	overrides: [
		{
			// Audio fingerprints are 16-bit codes, compared bit by bit.
			files: ["packages/core/src/playback/skips/fingerprint.ts"],
			rules: {
				"no-bitwise": "off",
			},
		},
	],
	plugins: ["typescript", "unicorn", "oxc", "import", "promise"],
	rules: {
		"no-unused-vars": [
			"error",
			{
				ignoreRestSiblings: true,
			},
		],
	},
});
