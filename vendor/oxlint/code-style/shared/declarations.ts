import type { ESTree } from "@oxlint/plugins";

import { Name } from "./name.ts";

type Check = (node: ESTree.Node, name: Name) => void;

type Declaration =
	| ESTree.Class
	| ESTree.Function
	| ESTree.TSInterfaceDeclaration
	| ESTree.TSTypeAliasDeclaration
	| ESTree.VariableDeclarator;

/**
 * Hands every name a file declares to one check: variables, functions,
 * class members and parameters, and also classes and types unless they are
 * left out. Destructured names and computed keys are skipped, since the file
 * doesn't choose them.
 */
export class Declarations {
	readonly #check: Check;

	constructor(check: Check) {
		this.#check = check;
	}

	/** Visitors for the declarations to check; `types` adds classes, interfaces and type aliases. */
	visitors(types: boolean) {
		const values = {
			ArrowFunctionExpression: (node: ESTree.ArrowFunctionExpression) => this.#parameters(node),
			FunctionDeclaration: (node: ESTree.Function) => {
				this.#declared(node);
				this.#parameters(node);
			},
			FunctionExpression: (node: ESTree.Function) => this.#parameters(node),
			MethodDefinition: (node: ESTree.MethodDefinition) => this.#member(node),
			PropertyDefinition: (node: ESTree.PropertyDefinition) => this.#member(node),
			VariableDeclarator: (node: ESTree.VariableDeclarator) => this.#declared(node),
		};

		if (!types) {
			return values;
		}

		return {
			...values,
			ClassDeclaration: (node: ESTree.Class) => this.#declared(node),
			TSInterfaceDeclaration: (node: ESTree.TSInterfaceDeclaration) => this.#declared(node),
			TSTypeAliasDeclaration: (node: ESTree.TSTypeAliasDeclaration) => this.#declared(node),
		};
	}

	#parameters(node: ESTree.ArrowFunctionExpression | ESTree.Function) {
		for (const parameter of node.params) {
			this.#visit(parameter);
		}
	}

	#declared(node: Declaration) {
		this.#visit(node.id);
	}

	#member(node: ESTree.MethodDefinition | ESTree.PropertyDefinition) {
		if (!node.computed) {
			this.#visit(node.key);
		}
	}

	#visit(node: ESTree.Node | null) {
		if (node?.type === "Identifier" || node?.type === "PrivateIdentifier") {
			this.#check(node, new Name(node.name));
		}
	}
}
