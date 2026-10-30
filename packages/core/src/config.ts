import { z } from "zod";

const EnvironmentSchema = z.object({
	/** AnimeSchedule application token, used to learn when dubs come out. */
	ANIME_SCHEDULE_API_KEY: z.string().min(1),
	/** Secret for signing session tokens. Changing it signs every device out. */
	AUTH_SECRET: z.string().min(32),
	/** PostgreSQL connection string used by the database module. */
	DATABASE_URL: z.url(),
	/**
	 * The `realesrgan-ncnn-vulkan` executable, next to its `models` folder,
	 * which upscales backdrops. Without it, upscaling a backdrop fails.
	 */
	REALESRGAN_BINARY: z.string().min(1).optional(),
	/**
	 * Where the image model that finds text on episode stills is kept. Left
	 * out, it is fetched into the dependency's own folder on first use, and
	 * again whenever that folder is replaced, as by a new container.
	 */
	STILL_MODEL_DIR: z.string().min(1).optional(),
	/**
	 * Secret for signing stream proxy tokens. Tokens authorize the proxy to fetch
	 * one upstream URL, so a leaked secret lets anyone use the proxy.
	 */
	STREAM_SIGNING_SECRET: z.string().min(32),
	/** The `faster-whisper` model that listens to dubs; larger ones hear more and take longer. */
	SUBTITLE_ALIGNMENT_MODEL: z.string().min(1).default("small.en"),
	/**
	 * A Python with `faster-whisper` installed, such as `/opt/whisper/bin/python`.
	 * With it, and ffmpeg on the `PATH`, the scheduler listens to each dub once
	 * and times the sub's subtitles to when its characters speak. Without it,
	 * dub subtitles are timed to the picture only.
	 */
	SUBTITLE_ALIGNMENT_PYTHON: z.string().min(1).optional(),
	/** TMDB API read access token (v4 bearer token), used to group anime into series. */
	TMDB_READ_ACCESS_TOKEN: z.string().min(1),
	/**
	 * Key the web app sends with every playback and stream request, so media
	 * is only served to it and not to anyone calling the API directly, even
	 * with an account. Share it with the web app as `WEB_CLIENT_KEY`.
	 */
	WEB_CLIENT_KEY: z.string().min(32),
});

const environment = EnvironmentSchema.parse(process.env);

/**
 * Validated process configuration for the core.
 *
 * Parsed once when first imported. A missing or malformed variable throws at
 * startup instead of failing later inside a request.
 */
export const config = {
	animeScheduleApiKey: environment.ANIME_SCHEDULE_API_KEY,
	authSecret: environment.AUTH_SECRET,
	databaseUrl: environment.DATABASE_URL,
	realesrganBinary: environment.REALESRGAN_BINARY ?? null,
	stillModelDir: environment.STILL_MODEL_DIR ?? null,
	streamSigningSecret: environment.STREAM_SIGNING_SECRET,
	subtitleAlignmentModel: environment.SUBTITLE_ALIGNMENT_MODEL,
	subtitleAlignmentPython: environment.SUBTITLE_ALIGNMENT_PYTHON ?? null,
	tmdbReadAccessToken: environment.TMDB_READ_ACCESS_TOKEN,
	webClientKey: environment.WEB_CLIENT_KEY,
};
