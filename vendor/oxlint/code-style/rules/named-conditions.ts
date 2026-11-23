import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

/** A loop or branch condition, counted by the `&&` and `||` operands it joins. */
class Condition {
	readonly #node: ESTree.Expression;

	constructor(node: ESTree.Expression) {
		this.#node = node;
	}

	/** How many operands `&&` and `||` join; `??` doesn't count, since it picks a value. */
	get operands(): number {
		const node = this.#node;

		if (node.type !== "LogicalExpression" || node.operator === "??") {
			return 1;
		}

		return new Condition(node.left).operands + new Condition(node.right).operands;
	}
}

/** §2 Conditions that join more than two operands get a name. */
export const namedConditions = defineRule({
	create: (context) => {
		const check = (node: ESTree.DoWhileStatement | ESTree.IfStatement | ESTree.WhileStatement) => {
			if (new Condition(node.test).operands > 2) {
				context.report({
					message: "Give this compound condition a name with a const (code-style §2).",
					node: node.test,
				});
			}
		};

		return {
			DoWhileStatement: check,
			IfStatement: check,
			WhileStatement: check,
		};
	},
	meta: {
		docs: {
			description: "§2 Conditions that join more than two operands get a name.",
		},
	},
});
