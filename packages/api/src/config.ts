import { z } from "zod";

const EnvironmentSchema = z.object({
  /** Port the HTTP server listens on. */
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  /**
   * The API's public base URL, such as `https://api.sora.example`. Better Auth
   * builds callback and cookie settings from it.
   */
  BETTER_AUTH_URL: z.url(),
  /** At least 32 random characters; signs sessions. Generate with: openssl rand -base64 48 */
  BETTER_AUTH_SECRET: z.string().min(32),
  /**
   * Comma-separated origins of browser clients allowed to call the API with
   * credentials, such as `https://sora.example,http://localhost:5173`.
   * Native clients send no origin and need no entry.
   */
  TRUSTED_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim())
        .filter((origin) => origin.length > 0)
    )
    .pipe(z.array(z.url()))
});

/**
 * Validated process configuration for the API.
 *
 * @remarks
 * Parsed once when first imported, so a missing or malformed variable fails
 * startup. The core reads its own variables (database, TMDB, stream signing).
 */
export const config = (() => {
  const environment = EnvironmentSchema.parse(process.env);

  return {
    port: environment.PORT,
    authUrl: environment.BETTER_AUTH_URL,
    authSecret: environment.BETTER_AUTH_SECRET,
    trustedOrigins: environment.TRUSTED_ORIGINS
  };
})();
