import { defineRule } from "@oxlint/plugins";

/**
 * §8 Missing data isn't hidden behind placeholder text such as
 * `title ?? "Unknown"`. Only text that says something is missing counts:
 * defaults such as `sort ?? "trending"` are fine.
 */
export const noLiteralFallback = defineRule({
	create: (context) => ({
		LogicalExpression: (node) => {
			const { right } = node;

			const placeholder =
				right.type === "Literal" &&
				/^(?<quote>["'])(?:unknown|untitled|unnamed|n\/a|no |missing)/iu.test(right.raw ?? "");

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
