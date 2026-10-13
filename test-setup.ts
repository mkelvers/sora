/**
 * Placeholders for the variables the core requires at import, so tests run
 * without an `.env` file. A real value already in the environment wins.
 */
const placeholders = {
	DATABASE_URL: "postgres://sora:sora@localhost:5432/sora",
	STREAM_SIGNING_SECRET: "test-stream-signing-secret-000000000",
	WEB_CLIENT_KEY: "test-web-client-key-0000000000000000",
	TMDB_READ_ACCESS_TOKEN: "test-tmdb-token",
	ANIME_SCHEDULE_API_KEY: "test-anime-schedule-key",
	AUTH_SECRET: "test-auth-secret-00000000000000000000",
};

for (const [name, value] of Object.entries(placeholders)) {
	process.env[name] ??= value;
}
