import app from './app';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { logger } from '@soraorg/core/server';
import { db } from '@soraorg/shared/db';
import { areMigrationsReady, markMigrationsReady } from './readiness';
import { runMigrationsWithRetry } from './startup';

const isProduction = process.env.NODE_ENV === 'production';

if (!isProduction) {
    markMigrationsReady();
}

const server = Bun.serve({
    port: process.env.PORT,
    idleTimeout: 60,
    fetch(request, server) {
        const path = new URL(request.url).pathname;
        if (!['/health', '/ready'].includes(path) && !areMigrationsReady()) {
            return Response.json(
                {
                    error: {
                        code: 'NOT_READY',
                        message: 'Database migrations are still running',
                    },
                },
                { status: 503 }
            );
        }

        return app.fetch(request, server);
    },
});

if (isProduction) {
    void runMigrationsWithRetry(() =>
        migrate(db, {
            migrationsFolder:
                process.env.MIGRATIONS_FOLDER ?? 'node_modules/@soraorg/shared/drizzle',
        })
    )
        .then(markMigrationsReady)
        .catch((cause) => {
            logger.error(
                'Database migrations failed after all startup retries',
                cause instanceof Error ? cause.message : String(cause)
            );
            server.stop(true);
            process.exit(1);
        });
}
