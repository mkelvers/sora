import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

/**
 * §4 A module's own functions are its exports. Supporting logic lives in a
 * class that holds what it works on, or is inlined where it is used.
 * Svelte components are exempt: their functions are per-instance.
 */
export const noLooseFunctions = defineRule({
	create: (context) => {
		if (context.filename.endsWith(".svelte")) {
			return {};
		}

		const report = (node: ESTree.Node) => {
			context.report({
				message:
					"Move this helper into a class that holds the value it works on, or inline it (code-style §4).",
				node,
			});
		};

		return {
			"Program > FunctionDeclaration": report,
			"Program > VariableDeclaration > VariableDeclarator": (node: ESTree.VariableDeclarator) => {
				const type = node.init?.type;

				if (type === "ArrowFunctionExpression" || type === "FunctionExpression") {
					report(node);
				}
			},
		};
	},
	meta: {
		docs: {
			description: "§4 No module-level helper functions that aren't exported.",
		},
	},
});
