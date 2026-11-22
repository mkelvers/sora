import { defineRule } from "@oxlint/plugins";

/** §10 Only negative type tests may expect a compiler error. */
export const noSuppressions = defineRule({
	create: (context) => {
		const test = /\.test\.[cm]?[jt]sx?$/u.test(context.filename);

		return {
			Program: () => {
				for (const comment of context.sourceCode.getAllComments()) {
					const directives = comment.value.match(
						/\b(?:eslint|oxlint)-(?:disable|enable)(?:-next-line|-line)?\b|@ts-(?:ignore|expect-error|nocheck)\b|\b(?:biome-ignore|prettier-ignore|oxfmt-ignore|svelte-ignore)\b|@(?:noformat|noprettier)\b/gu,
					);

					if (directives === null) {
						continue;
					}

					const assertion =
						test &&
						directives.length === 1 &&
						/^\s*@ts-expect-error\s+\S[^\r\n]*$/u.test(comment.value);

					if (assertion) {
						continue;
					}

					context.report({
						loc: comment.loc,
						message:
							"Fix the code instead of suppressing lint, formatting, or type checks (code-style §10).",
					});
				}
			},
		};
	},
	meta: {
		docs: {
			description: "§10 No lint, format, or type-check suppressions.",
		},
	},
});
