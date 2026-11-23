import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

/** The body of an error handler: a `catch` block, or the callback passed to `.catch()`. */
class Handler {
	readonly #body: ESTree.Node;

	constructor(body: ESTree.Node) {
		this.#body = body;
	}

	/** Whether the handler drops the error: it does nothing, returns a placeholder, or only logs. */
	get swallows(): boolean {
		const body = this.#body;

		if (body.type === "BlockStatement") {
			return body.body.every(
				(statement) =>
					statement.type === "ExpressionStatement" && new Handler(statement.expression).swallows,
			);
		}

		if (body.type === "CallExpression") {
			return (
				body.callee.type === "MemberExpression" &&
				body.callee.object.type === "Identifier" &&
				body.callee.object.name === "console"
			);
		}

		const undefinedValue = body.type === "Identifier" && body.name === "undefined";

		return body.type === "Literal" || body.type === "UnaryExpression" || undefinedValue;
	}
}

/** §8 No error handler drops the error. */
export const noSwallowedErrors = defineRule({
	create: (context) => ({
		CallExpression: (node) => {
			const [callback] = node.arguments;

			const catches =
				node.callee.type === "MemberExpression" &&
				node.callee.property.type === "Identifier" &&
				node.callee.property.name === "catch";

			const inline =
				callback?.type === "ArrowFunctionExpression" || callback?.type === "FunctionExpression";

			const swallows = inline && callback.body !== null && new Handler(callback.body).swallows;

			if (catches && swallows) {
				context.report({
					message: "This .catch drops the error; handle it or let it propagate (code-style §8).",
					node: callback,
				});
			}
		},
		CatchClause: (node) => {
			if (new Handler(node.body).swallows) {
				context.report({
					message: "This catch drops the error; handle it or let it propagate (code-style §8).",
					node,
				});
			}
		},
	}),
	meta: {
		docs: {
			description: "§8 No error handler drops the error.",
		},
	},
});
