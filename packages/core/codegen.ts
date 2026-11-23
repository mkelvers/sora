import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Generates AniList operation types and result validators from the live schema.
 *
 * Every `.graphql` document under `src/anilist/operations` becomes a
 * `TypedDocumentString` whose result and variable types are derived from the
 * schema, so a query change that no longer matches AniList fails `check`.
 *
 * Run with `bun run graphql:generate` after editing an operation.
 */
export default {
	documents: "src/anilist/operations/*.graphql",
	generates: {
		"src/anilist/graphql.generated.ts": {
			config: {
				// AniList treats an explicit null differently from an omitted variable
				// (`format_in: null` is a 500), so optional variables must stay optional.
				avoidOptionals: false,
				documentMode: "string",
				enumsAsTypes: true,
				scalars: {
					CountryCode: "string",
					FuzzyDateInt: "number",
					Json: "unknown",
				},
				skipTypename: true,
				useTypeImports: true,
			},
			plugins: ["typescript-operations", "typed-document-node"],
		},
		"src/anilist/validation.generated.ts": {
			config: {
				objects: false,
				scalarSchemas: "./wire",
			},
			plugins: ["@nxgt/graphql-codegen-zod"],
		},
	},
	schema: "https://graphql.anilist.co",
} satisfies CodegenConfig;
