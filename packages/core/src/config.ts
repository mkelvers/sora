import { z } from "zod";

const EnvironmentSchema = z.object({
	/** PostgreSQL connection string used by the database module. */
	DATABASE_URL: z.url(),
	/**
	 * Secret for signing stream proxy tokens. Tokens authorize the proxy to fetch
	 * one upstream URL, so a leaked secret lets anyone use the proxy.
	 */
	STREAM_SIGNING_SECRET: z.string().min(32),
	/**
	 * Key the web app sends with every playback and stream request, so media
	 * is only served to it and not to anyone calling the API directly, even
	 * with an account. Share it with the web app as `WEB_CLIENT_KEY`.
	 */
	WEB_CLIENT_KEY: z.string().min(32),
	/** TMDB API read access token (v4 bearer token), used to group anime into series. */
	TMDB_READ_ACCESS_TOKEN: z.string().min(1),
	/** AnimeSchedule application token, used to learn when dubs come out. */
	ANIME_SCHEDULE_API_KEY: z.string().min(1),
	/** Secret for signing session tokens. Changing it signs every device out. */
	AUTH_SECRET: z.string().min(32),
	/** The API's public origin, which Better Auth builds its URLs from. */
	AUTH_URL: z.url().default("http://localhost:3000"),
	/**
	 * Other origins allowed to sign in, comma-separated: for example the
	 * internal URL a web server reaches the API by, when it differs from
	 * `AUTH_URL`.
	 */
	AUTH_TRUSTED_ORIGINS: z
		.string()
		.default("")
		.transform((value) =>
			value
				.split(",")
				.map((origin) => origin.trim())
				.filter(Boolean),
		),
});

const environment = EnvironmentSchema.parse(process.env);

/**
 * Validated process configuration for the core.
 *
 * @remarks
 * Parsed once when first imported. A missing or malformed variable throws at
 * startup instead of failing later inside a request.
 */
export const config = {
	databaseUrl: environment.DATABASE_URL,
	streamSigningSecret: environment.STREAM_SIGNING_SECRET,
	webClientKey: environment.WEB_CLIENT_KEY,
	tmdbReadAccessToken: environment.TMDB_READ_ACCESS_TOKEN,
	animeScheduleApiKey: environment.ANIME_SCHEDULE_API_KEY,
	authSecret: environment.AUTH_SECRET,
	authUrl: environment.AUTH_URL,
	authTrustedOrigins: environment.AUTH_TRUSTED_ORIGINS,
};
