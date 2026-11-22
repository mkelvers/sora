import { defineRule } from "@oxlint/plugins";

/** §8 Missing data isn't hidden behind placeholder text such as `title ?? "Unknown"`. */
export const noLiteralFallback = defineRule({
	create: (context) => ({
		LogicalExpression: (node) => {
			const { right } = node;

			const placeholder =
				right.type === "Literal" && /^(?<quote>["']).+\k<quote>$/u.test(right.raw ?? "");

			if (node.operator === "??" && placeholder) {
				context.report({
					message:
						"Don't hide missing data behind placeholder text; throw, or default it in the schema (code-style §8).",
					node: right,
				});
			}
		},
	}),
	meta: {
		docs: {
			description: "§8 No placeholder text for missing data.",
		},
	},
});
