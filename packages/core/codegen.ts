import type { CodegenConfig } from "@graphql-codegen/cli";

/**
 * Generates fully typed AniList operations from the live AniList schema.
 *
 * Every `.graphql` document under `src/anilist/operations` becomes a
 * `TypedDocumentString` whose result and variable types are derived from the
 * schema, so a query change that no longer matches AniList fails `check`.
 *
 * Run with `bun run graphql:generate` after editing an operation.
 */
export default {
  schema: "https://graphql.anilist.co",
  documents: "src/anilist/operations/*.graphql",
  generates: {
    "src/anilist/graphql.generated.ts": {
      plugins: [
        "typescript-operations",
        "typed-document-node"
      ],
      config: {
        documentMode: "string",
        enumsAsTypes: true,
        skipTypename: true,
        useTypeImports: true,
        // AniList treats an explicit null differently from an omitted variable
        // (`format_in: null` is a 500), so optional variables must stay optional.
        avoidOptionals: false,
        scalars: {
          CountryCode: "string",
          FuzzyDateInt: "number",
          Json: "unknown"
        }
      }
    }
  }
} satisfies CodegenConfig;
