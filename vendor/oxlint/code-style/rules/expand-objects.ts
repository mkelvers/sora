import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

type Braced = ESTree.ObjectExpression | ESTree.TSInterfaceBody | ESTree.TSTypeLiteral;

/** The members between an object's or type's braces. */
class Members {
	readonly #node: Braced;

	constructor(node: Braced) {
		this.#node = node;
	}

	/** Whether two members share a line, outside a parameter's type, which the formatter keeps on one line. */
	get crowded(): boolean {
		const members = this.#list;

		if (this.#parameter) {
			return false;
		}

		return members.some(
			(member, index) => members[index - 1]?.loc.end.line === member.loc.start.line,
		);
	}

	get #parameter(): boolean {
		const annotation = this.#node.parent;
		const binding = annotation.parent;

		if (annotation.type !== "TSTypeAnnotation" || !binding) {
			return false;
		}

		const callable = ["ArrowFunctionExpression", "FunctionDeclaration", "FunctionExpression"];

		return callable.includes(binding.parent?.type ?? "");
	}

	get #list(): ESTree.Span[] {
		const node = this.#node;

		if (node.type === "TSTypeLiteral") {
			return node.members;
		}

		if (node.type === "TSInterfaceBody") {
			return node.body;
		}

		return node.properties;
	}
}

/**
 * §7 Object literals and types with several members put each on its own
 * line, except a parameter's inline type, which the formatter collapses. The fix breaks the line after the opening brace; the formatter then
 * expands the rest.
 */
export const expandObjects = defineRule({
	create: (context) => {
		const check = (node: Braced) => {
			if (!new Members(node).crowded) {
				return;
			}

			const [brace] = node.range;
			context.report({
				fix: (fixer) => fixer.insertTextAfterRange([brace, brace + 1], "\n"),
				message: "Put each property on its own line when there is more than one (code-style §7).",
				node,
			});
		};

		return {
			ObjectExpression: check,
			TSInterfaceBody: check,
			TSTypeLiteral: check,
		};
	},
	meta: {
		docs: {
			description: "§7 Object literals and types with several members go one per line.",
		},
		fixable: "code",
	},
});
