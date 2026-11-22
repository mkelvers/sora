import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

type Callable = ESTree.ArrowFunctionExpression | ESTree.Function;

/** A function declared under a name, as opposed to a callback passed inline. */
class Definition {
	static readonly #holders = new Set([
		"MethodDefinition",
		"PropertyDefinition",
		"VariableDeclarator",
	]);

	readonly #node: Callable;

	constructor(node: Callable) {
		this.#node = node;
	}

	/** Whether the whole body is one call that receives exactly the function's own parameters, in order. */
	get forwards(): boolean {
		const node = this.#node;
		const call = this.#call;
		const named = node.type === "FunctionDeclaration" || Definition.#holders.has(node.parent.type);
		const matches = call?.arguments.length === node.params.length;

		if (!matches || !named) {
			return false;
		}

		if (this.#bound) {
			return false;
		}

		return call?.arguments.every((argument, index) => {
			const parameter = node.params[index];

			return (
				argument.type === "Identifier" &&
				parameter?.type === "Identifier" &&
				argument.name === parameter.name
			);
		});
	}

	/**
	 * Whether the call goes through the instance's own state or a literal,
	 * such as `this.#items.has(key)` or `/\d/u.test(text)`: the function then
	 * exposes or names something, rather than only passing arguments on.
	 */
	get #bound(): boolean {
		const callee = this.#call?.callee;

		if (callee?.type !== "MemberExpression") {
			return false;
		}

		let root = callee.object;

		while (root?.type === "MemberExpression") {
			root = root.object;
		}

		return root.type === "ThisExpression" || root.type === "Literal";
	}

	/** The call the body consists of, awaited or not, when the body is nothing else. */
	get #call(): ESTree.CallExpression | undefined {
		const expression = this.#expression;

		if (expression?.type === "AwaitExpression" && expression.argument.type === "CallExpression") {
			return expression.argument;
		}

		if (expression?.type === "CallExpression") {
			return expression;
		}

		return undefined;
	}

	/** The one expression the body consists of: an arrow's expression, or a block's single statement. */
	get #expression(): ESTree.Node | null | undefined {
		const { body } = this.#node;

		if (body?.type !== "BlockStatement") {
			return body;
		}

		const [only] = body.body;

		if (body.body.length !== 1) {
			return undefined;
		}

		if (only?.type === "ReturnStatement") {
			return only.argument;
		}

		if (only?.type === "ExpressionStatement") {
			return only.expression;
		}

		return undefined;
	}
}

/**
 * §5 No function only forwards its arguments to another call. Calls on the
 * instance's own state or on a literal are exempt: they expose or name it.
 */
export const noWrappers = defineRule({
	create: (context) => {
		const check = (node: Callable) => {
			if (new Definition(node).forwards) {
				context.report({
					message:
						"This function only forwards to another call; call that directly (code-style §5).",
					node,
				});
			}
		};

		return {
			ArrowFunctionExpression: check,
			FunctionDeclaration: check,
			FunctionExpression: check,
		};
	},
	meta: {
		docs: {
			description: "§5 No function only forwards its arguments to another call.",
		},
	},
});
