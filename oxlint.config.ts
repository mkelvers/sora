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
		"vendor/oxlint/anti-slop/**",
		"**/*.generated.ts",
		"**/.svelte-kit/**",
	],
	jsPlugins: ["./vendor/oxlint/anti-slop/index.ts", "./vendor/oxlint/code-style/index.ts"],
	overrides: [
		{
			files: ["vendor/oxlint/code-style/**"],
			rules: {
				"anti-slop/no-array-filter-map": "error",
				"anti-slop/no-chained-type-assertions": "error",
				"anti-slop/no-conditional-empty-object-spread": "error",
				"anti-slop/no-known-value-widening": "error",
				"anti-slop/no-module-mocking": "error",
				"anti-slop/no-object-parameters": "error",
				"anti-slop/no-reduce-accumulator-copy": "error",
				"anti-slop/no-reflect-apply": "error",
				"anti-slop/no-reflect-get": "error",
				"anti-slop/no-runtime-typeof": "error",
				"anti-slop/no-shape-in-symbol-names": "error",
				"anti-slop/no-unknown-parameters": "error",
				"anti-slop/no-unknown-returns": "error",
				"anti-slop/no-unknown-type-aliases": "error",
				"anti-slop/no-unsafe-dictionary-type": "error",
				"anti-slop/no-widen-then-assert": "error",
				"anti-slop/require-readable-spacing": "error",
				"anti-slop/require-safety-comment-for-type-assertion": "error",
				"code-style/expand-objects": "error",
				"code-style/name-context": "error",
				"code-style/name-length": "error",
				"code-style/name-words": "error",
				"code-style/named-conditions": "error",
				"code-style/no-literal-fallback": "error",
				"code-style/no-loose-functions": "error",
				"code-style/no-module-let": "error",
				"code-style/no-single-use-constants": "error",
				"code-style/no-suppressions": "error",
				"code-style/no-swallowed-errors": "error",
				"code-style/no-wrappers": "error",
				"no-ternary": "error",
			},
		},
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
