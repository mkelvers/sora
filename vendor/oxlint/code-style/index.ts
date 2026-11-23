/**
 * Oxlint rules for the code-style skill, one rule per file in `rules/`. Each
 * rule names the section of the skill it enforces.
 *
 * The original lives in the skill at `~/.config/agents/skills/code-style/oxlint/`.
 * Change rules there and copy the folder into each repo.
 */
import { definePlugin } from "@oxlint/plugins";

import { expandObjects } from "./rules/expand-objects.ts";
import { nameContext } from "./rules/name-context.ts";
import { nameLength } from "./rules/name-length.ts";
import { nameWords } from "./rules/name-words.ts";
import { namedConditions } from "./rules/named-conditions.ts";
import { noLiteralFallback } from "./rules/no-literal-fallback.ts";
import { noLooseFunctions } from "./rules/no-loose-functions.ts";
import { noModuleLet } from "./rules/no-module-let.ts";
import { singleUse } from "./rules/no-single-use-constants.ts";
import { noSuppressions } from "./rules/no-suppressions.ts";
import { noSwallowedErrors } from "./rules/no-swallowed-errors.ts";
import { noWrappers } from "./rules/no-wrappers.ts";

export default definePlugin({
	meta: {
		name: "code-style",
	},
	rules: {
		"expand-objects": expandObjects,
		"name-context": nameContext,
		"name-length": nameLength,
		"name-words": nameWords,
		"named-conditions": namedConditions,
		"no-literal-fallback": noLiteralFallback,
		"no-loose-functions": noLooseFunctions,
		"no-module-let": noModuleLet,
		"no-single-use-constants": singleUse,
		"no-suppressions": noSuppressions,
		"no-swallowed-errors": noSwallowedErrors,
		"no-wrappers": noWrappers,
	},
});
