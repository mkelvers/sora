import type { CodegenConfig } from '@graphql-codegen/cli';

export default {
    generates: {
        'src/catalog/anilist/graphql/generated/': {
            schema: 'https://graphql.anilist.co',
            documents: 'src/catalog/anilist/graphql/operations/anilist/*.graphql',
            preset: 'client',
            config: {
                documentMode: 'string',
                enumsAsTypes: true,
                skipTypename: true,
                useTypeImports: true,
            },
        },
    },
} satisfies CodegenConfig;
