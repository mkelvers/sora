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
	/**
	 * A Python with `faster-whisper` installed, such as `/opt/whisper/bin/python`.
	 * With it, and ffmpeg on the `PATH`, the scheduler listens to each dub once
	 * and times the sub's subtitles to when its characters speak. Without it,
	 * dub subtitles are timed to the picture only.
	 */
	SUBTITLE_ALIGNMENT_PYTHON: z.string().min(1).optional(),
	/** The `faster-whisper` model that listens to dubs; larger ones hear more and take longer. */
	SUBTITLE_ALIGNMENT_MODEL: z.string().min(1).default("small.en"),
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
	subtitleAlignmentPython: environment.SUBTITLE_ALIGNMENT_PYTHON ?? null,
	subtitleAlignmentModel: environment.SUBTITLE_ALIGNMENT_MODEL,
};
