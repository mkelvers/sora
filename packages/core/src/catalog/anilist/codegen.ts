import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
    generates: {
        'src/catalog/anilist/graphql/graphql.generated.ts': {
            schema: 'https://graphql.anilist.co',
            documents: 'src/catalog/anilist/graphql/operations/anilist/*.graphql',
            plugins: ['typescript-operations', 'typed-document-node'],
            config: {
                documentMode: 'string',
                enumsAsTypes: true,
                skipTypename: true,
                useTypeImports: true,
            },
        },
    },
} satisfies CodegenConfig;
