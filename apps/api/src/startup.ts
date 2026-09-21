export async function runMigrationsWithRetry(
    migrateDatabase: () => Promise<void>,
    sleep: (delayMs: number) => Promise<void> = (delayMs) => Bun.sleep(delayMs)
): Promise<void> {
    const retryDelaysMs = [1_000, 2_000, 4_000, 8_000, 16_000];

    for (let attempt = 0; attempt <= retryDelaysMs.length; attempt += 1) {
        try {
            await migrateDatabase();
            return;
        } catch (cause) {
            const delayMs = retryDelaysMs[attempt];
            if (delayMs === undefined) {
                throw cause;
            }

            await sleep(delayMs);
        }
    }
}
