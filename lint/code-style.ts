/**
 * Oxlint rules for the code-style skill. Each rule enforces one section of
 * the skill; the section is named in the rule's description and message.
 *
 * Copy this file into a repo, add `@oxlint/plugins` as a dev dependency at
 * the version of `oxlint`, and list it under `jsPlugins` in the oxlint
 * config. The copy in the skill's `lint/` folder is the original.
 */
import path from "node:path";

import { definePlugin, defineRule } from "@oxlint/plugins";
import type { Context, ESTree } from "@oxlint/plugins";

const wordBoundary = /(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])|[_$-]+/u;
const suppression = /\b(?:eslint|oxlint)-disable|@ts-(?:ignore|expect-error|nocheck)|biome-ignore/u;
const testFile = /\.test\.[jt]s$/u;
const maxWords = 3;
const maxOperands = 2;

const fillerSuffixes = new Set([
	"async",
	"base",
	"data",
	"fn",
	"helper",
	"helpers",
	"impl",
	"info",
	"later",
	"list",
	"manager",
	"map",
	"promise",
	"util",
	"utils",
]);

const abbreviations = new Set([
	"arr",
	"btn",
	"cb",
	"cfg",
	"conf",
	"ctx",
	"err",
	"func",
	"idx",
	"msg",
	"num",
	"obj",
	"req",
	"res",
	"str",
	"tmp",
	"val",
]);

const genericFolders = new Set([
	"",
	".",
	"app",
	"apps",
	"components",
	"lib",
	"packages",
	"routes",
	"server",
	"src",
	"test",
	"tests",
]);

const exits = new Set(["BreakStatement", "ContinueStatement", "ReturnStatement", "ThrowStatement"]);

const namedHolders = new Set(["MethodDefinition", "PropertyDefinition", "VariableDeclarator"]);

type Check = (node: ESTree.Node, name: string) => void;
type AnyFunction = ESTree.ArrowFunctionExpression | ESTree.Function;
type Declaration =
	| ESTree.Class
	| ESTree.Function
	| ESTree.TSInterfaceDeclaration
	| ESTree.TSTypeAliasDeclaration
	| ESTree.VariableDeclarator;
type Members = ESTree.ObjectExpression | ESTree.TSInterfaceBody | ESTree.TSTypeLiteral;

/** The lower-cased words of an identifier: `migrateDatabase` → `migrate`, `database`. */
const words = (name: string): string[] => {
	const bare = name.replace(/^[#_$]+/u, "");
	const parts = bare.split(wordBoundary).filter(Boolean);
	return parts.map((part) => part.toLowerCase());
};

const singular = (word: string): string => word.replace(/s$/u, "");

/** The name a binding or key declares; undefined for destructuring and computed keys. */
const nameOf = (node: ESTree.Node | null): string | undefined => {
	if (node?.type === "Identifier" || node?.type === "PrivateIdentifier") {
		return node.name;
	}
	return undefined;
};

/**
 * Visitors that pass every name the file declares to `check`: variables,
 * functions, members and parameters, plus classes and types unless `types`
 * is false.
 */
const declarations = (check: Check, types = true) => {
	const parameters = (node: AnyFunction) => {
		for (const parameter of node.params) {
			const name = nameOf(parameter);
			if (name) {
				check(parameter, name);
			}
		}
	};
	const declared = (node: Declaration) => {
		const name = nameOf(node.id);
		if (name && node.id) {
			check(node.id, name);
		}
	};
	const member = (node: ESTree.MethodDefinition | ESTree.PropertyDefinition) => {
		const name = nameOf(node.key);
		if (name && !node.computed) {
			check(node.key, name);
		}
	};
	const values = {
		ArrowFunctionExpression: parameters,
		FunctionDeclaration: (node: ESTree.Function) => {
			declared(node);
			parameters(node);
		},
		FunctionExpression: parameters,
		MethodDefinition: member,
		PropertyDefinition: member,
		VariableDeclarator: declared,
	};
	if (!types) {
		return values;
	}

	return {
		...values,
		ClassDeclaration: declared,
		TSInterfaceDeclaration: declared,
		TSTypeAliasDeclaration: declared,
	};
};

const isExit = (statement: ESTree.Statement | undefined): boolean => {
	if (statement?.type === "BlockStatement") {
		return isExit(statement.body.at(-1));
	}
	return exits.has(statement?.type ?? "");
};

const isGuard = (statement: ESTree.Statement | ESTree.Directive | undefined): boolean => {
	if (statement?.type !== "IfStatement") {
		return false;
	}
	return !statement.alternate && isExit(statement.consequent);
};

const operands = (node: ESTree.Expression): number => {
	const isLogical = node.type === "LogicalExpression" && node.operator !== "??";
	if (isLogical) {
		return operands(node.left) + operands(node.right);
	}
	return 1;
};

const isEmptyHandler = (handler: ESTree.Node): boolean => {
	const isFunction =
		handler.type === "ArrowFunctionExpression" || handler.type === "FunctionExpression";
	if (!isFunction) {
		return false;
	}
	if (handler.body?.type === "BlockStatement") {
		return handler.body.body.length === 0;
	}

	const { body } = handler;
	const isUndefined = body?.type === "Identifier" && body.name === "undefined";
	return body?.type === "Literal" || body?.type === "UnaryExpression" || isUndefined;
};

const isLog = (statement: ESTree.Statement): boolean => {
	if (statement.type !== "ExpressionStatement") {
		return false;
	}

	const call = statement.expression;
	if (call.type !== "CallExpression" || call.callee.type !== "MemberExpression") {
		return false;
	}
	return nameOf(call.callee.object) === "console";
};

/** True for a function declared under a name, false for one passed inline as a callback. */
const isNamed = (node: AnyFunction): boolean => {
	if (node.type === "FunctionDeclaration") {
		return true;
	}
	return namedHolders.has(node.parent.type);
};

/** The expression a function's body consists of, when it is a single one. */
const soleExpression = (node: AnyFunction): ESTree.Node | null | undefined => {
	if (node.body?.type !== "BlockStatement") {
		return node.body;
	}

	const [only] = node.body.body;
	if (node.body.body.length !== 1) {
		return undefined;
	}
	if (only?.type === "ReturnStatement") {
		return only.argument;
	}
	if (only?.type === "ExpressionStatement") {
		const { expression } = only;
		return expression;
	}
	return undefined;
};

/** The call a function's whole body consists of, awaited or not. */
const soleCall = (node: AnyFunction): ESTree.CallExpression | undefined => {
	const expression = soleExpression(node);
	if (expression?.type === "CallExpression") {
		return expression;
	}
	if (expression?.type === "AwaitExpression" && expression.argument.type === "CallExpression") {
		return expression.argument;
	}
	return undefined;
};

const isWrapper = (node: AnyFunction): boolean => {
	const call = soleCall(node);
	if (!call || !isNamed(node)) {
		return false;
	}
	if (call.arguments.length !== node.params.length) {
		return false;
	}

	return call.arguments.every((argument, index) => {
		const parameter = nameOf(node.params[index] ?? null);
		return parameter !== undefined && nameOf(argument) === parameter;
	});
};

const membersOf = (node: Members): ESTree.Span[] => {
	if (node.type === "TSTypeLiteral") {
		return node.members;
	}
	if (node.type === "TSInterfaceBody") {
		return node.body;
	}
	return node.properties;
};

const report = (context: Context, node: ESTree.Node, message: string) => {
	context.report({
		message,
		node,
	});
};

/** Whether `next` must sit a blank line below `statement`: it follows a guard and starts new work. */
const needsGap = (
	statement: ESTree.Statement | ESTree.Directive,
	next: ESTree.Statement | ESTree.Directive,
	last: boolean,
): boolean => {
	if (!isGuard(statement) || isGuard(next)) {
		return false;
	}

	const isResult = last && exits.has(next.type);
	return !isResult;
};

const guardSpacing = defineRule({
	create: (context) => {
		const check = (node: ESTree.BlockStatement | ESTree.Program) => {
			for (const [index, statement] of node.body.entries()) {
				const next = node.body[index + 1];
				const last = index + 2 === node.body.length;
				if (!next || !needsGap(statement, next, last)) {
					continue;
				}

				if (next.loc.start.line === statement.loc.end.line + 1) {
					report(context, next, "Leave a blank line after a guard clause (code-style §3).");
				}
			}
		};
		return {
			BlockStatement: check,
			Program: check,
		};
	},
	meta: {
		docs: {
			description:
				"§3 Separate guards from the work that follows with a blank line. A final return right after a guard reads as its other branch and may follow directly.",
		},
	},
});

const expandObjects = defineRule({
	create: (context) => {
		const check = (node: Members) => {
			const members = membersOf(node);
			const crowded = members.some((member, index) => {
				const previous = members[index - 1];
				return previous?.loc.end.line === member.loc.start.line;
			});
			if (!crowded) {
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
			description:
				"§7 Object literals and types with several properties go one per line. The fix breaks the line after the brace; the formatter expands the rest.",
		},
		fixable: "code",
	},
});

const nameContext = defineRule({
	create: (context) => {
		const folder = singular(path.basename(path.dirname(context.filename)).toLowerCase());
		const [file = ""] = path.basename(context.filename).split(".");
		const candidates = [folder, singular(file.toLowerCase())];
		const owners = new Set(
			candidates.filter((owner) => !genericFolders.has(owner) && !owner.startsWith("+")),
		);
		const check: Check = (node, name) => {
			const parts = words(name);
			const repeated = parts.find((part) => owners.has(singular(part)));
			if (parts.length < 2 || !repeated) {
				return;
			}

			report(
				context,
				node,
				`"${name}" repeats "${repeated}", which its folder or file already says (code-style §6).`,
			);
		};
		return declarations(check, false);
	},
	meta: {
		docs: {
			description:
				"§6 Don't repeat the folder or file name in a value or function declared inside it. Types and classes keep it: no owner carries their context.",
		},
	},
});

const nameLength = defineRule({
	create: (context) => {
		const check: Check = (node, name) => {
			const count = words(name).length;
			if (count > maxWords) {
				report(
					context,
					node,
					`"${name}" has ${count} words; use at most ${maxWords} (code-style §6).`,
				);
			}
		};
		return declarations(check);
	},
	meta: {
		docs: {
			description: "§6 Names have at most three words.",
		},
	},
});

const nameWords = defineRule({
	create: (context) => {
		const check: Check = (node, name) => {
			const parts = words(name);
			const [first] = parts;
			const last = parts.at(-1) ?? "";
			const compound = parts.length > 1;
			const filler = compound && fillerSuffixes.has(last);
			const handler = compound && first === "handle";
			let word = parts.find((part) => abbreviations.has(part));
			if (!word && filler) {
				word = last;
			}
			if (!word && handler) {
				word = first;
			}
			if (!word) {
				return;
			}

			report(context, node, `"${name}" uses "${word}"; name what it is instead (code-style §6).`);
		};
		return declarations(check);
	},
	meta: {
		docs: {
			description: "§6 No abbreviations, filler suffixes, or handle- prefixes in names.",
		},
	},
});

const namedConditions = defineRule({
	create: (context) => {
		const check = (node: ESTree.DoWhileStatement | ESTree.IfStatement | ESTree.WhileStatement) => {
			if (operands(node.test) > maxOperands) {
				report(
					context,
					node.test,
					"Give this compound condition a name with a const (code-style §2).",
				);
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
			description: "§2 Conditions with more than two operands get a name.",
		},
	},
});

const noLiteralFallback = defineRule({
	create: (context) => ({
		LogicalExpression: (node) => {
			const { right } = node;
			const isText =
				right.type === "Literal" && typeof right.value === "string" && right.value !== "";
			if (node.operator === "??" && isText) {
				report(
					context,
					right,
					"Don't hide missing data behind placeholder text; throw, or default it in the schema (code-style §8).",
				);
			}
		},
	}),
	meta: {
		docs: {
			description: "§8 No placeholder text for missing data.",
		},
	},
});

const noModuleLet = defineRule({
	create: (context) => {
		if (context.filename.endsWith(".svelte")) {
			return {};
		}

		const check = (node: ESTree.VariableDeclaration) => {
			if (node.kind === "let" || node.kind === "var") {
				report(
					context,
					node,
					"Module-level state belongs in a class with private fields (code-style §4).",
				);
			}
		};
		return {
			"ExportNamedDeclaration > VariableDeclaration": check,
			"Program > VariableDeclaration": check,
		};
	},
	meta: {
		docs: {
			description:
				"§4 No module-level let or var. Svelte components are exempt: their let is per-instance state.",
		},
	},
});

const noSuppressions = defineRule({
	create: (context) => {
		const isTest = testFile.test(context.filename);
		return {
			Program: () => {
				for (const comment of context.sourceCode.getAllComments()) {
					const isTypeTest = isTest && comment.value.includes("@ts-expect-error");
					if (!suppression.test(comment.value) || isTypeTest) {
						continue;
					}

					context.report({
						loc: comment.loc,
						message: "Fix the code instead of suppressing the check (code-style §10).",
					});
				}
			},
		};
	},
	meta: {
		docs: {
			description:
				"§10 No lint or type-check suppressions. Tests may use @ts-expect-error to assert a type error.",
		},
	},
});

const noSwallowedErrors = defineRule({
	create: (context) => ({
		CallExpression: (node) => {
			const { callee } = node;
			const [handler] = node.arguments;
			const isCatch = callee.type === "MemberExpression" && nameOf(callee.property) === "catch";
			const swallows = handler !== undefined && isEmptyHandler(handler);
			if (isCatch && swallows) {
				report(
					context,
					handler,
					"This .catch drops the error; handle it or let it propagate (code-style §8).",
				);
			}
		},
		CatchClause: (node) => {
			if (node.body.body.every(isLog)) {
				report(
					context,
					node,
					"This catch drops the error; handle it or let it propagate (code-style §8).",
				);
			}
		},
	}),
	meta: {
		docs: {
			description: "§8 Never swallow an error.",
		},
	},
});

const noWrappers = defineRule({
	create: (context) => {
		const check = (node: AnyFunction) => {
			if (isWrapper(node)) {
				report(
					context,
					node,
					"This function only forwards to another call; call that directly (code-style §5).",
				);
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
			description: "§5 No functions that only forward their arguments to another call.",
		},
	},
});

export default definePlugin({
	meta: {
		name: "code-style",
	},
	rules: {
		"expand-objects": expandObjects,
		"guard-spacing": guardSpacing,
		"name-context": nameContext,
		"name-length": nameLength,
		"name-words": nameWords,
		"named-conditions": namedConditions,
		"no-literal-fallback": noLiteralFallback,
		"no-module-let": noModuleLet,
		"no-suppressions": noSuppressions,
		"no-swallowed-errors": noSwallowedErrors,
		"no-wrappers": noWrappers,
	},
});
