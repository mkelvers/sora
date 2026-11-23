import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

/** §4 No module-level `let` or `var`. Svelte components are exempt: their `let` is per-instance state. */
export const noModuleLet = defineRule({
	create: (context) => {
		if (context.filename.endsWith(".svelte")) {
			return {};
		}

		const check = (node: ESTree.VariableDeclaration) => {
			if (node.kind === "let" || node.kind === "var") {
				context.report({
					message: "Module-level state belongs in a class with private fields (code-style §4).",
					node,
				});
			}
		};

		return {
			"ExportNamedDeclaration > VariableDeclaration": check,
			"Program > VariableDeclaration": check,
		};
	},
	meta: {
		docs: {
			description: "§4 No module-level let or var.",
		},
	},
});
