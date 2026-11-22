import { defineRule } from "@oxlint/plugins";

/** §10 No comments that switch off lint or type checks. Tests may still use TypeScript's expect-error comment to assert a type error. */
export const noSuppressions = defineRule({
	create: (context) => {
		const test = /\.test\.[jt]s$/u.test(context.filename);

		return {
			Program: () => {
				for (const comment of context.sourceCode.getAllComments()) {
					const suppresses =
						/\b(?:eslint|oxlint)-disable|@ts-(?:ignore|expect-error|nocheck)|biome-ignore/u.test(
							comment.value,
						);

					const asserts = test && comment.value.includes("@ts-expect-error");

					if (suppresses && !asserts) {
						context.report({
							loc: comment.loc,
							message: "Fix the code instead of suppressing the check (code-style §10).",
						});
					}
				}
			},
		};
	},
	meta: {
		docs: {
			description: "§10 No lint or type-check suppressions.",
		},
	},
});
