import { z } from "zod";

import { parseOriginPattern, type OriginPattern } from "./http/origins";

const EnvironmentSchema = z.object({
  /** Port the HTTP server listens on. */
  PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
  /**
   * The API's public base URL, such as `https://api.sora.example`. Better Auth
   * builds callback and cookie settings from it.
   */
  BETTER_AUTH_URL: z.url(),
  /**
   * Whether the API runs behind a reverse proxy that sets `X-Forwarded-For`.
   * Only then is that header believed; otherwise any client could claim any
   * address and dodge rate limits.
   */
  TRUST_PROXY: z
    .enum([
      "true",
      "false"
    ])
    .default("false")
    .transform((value) => value === "true"),
  /** At least 32 random characters; signs sessions. Generate with: openssl rand -base64 48 */
  BETTER_AUTH_SECRET: z.string().min(32),
  /**
   * Comma-separated origins of browser clients allowed to call the API with
   * credentials. `*.` matches any subdomain, such as
   * `https://*.mkelvers.tech,http://localhost:5173`; see `http/origins.ts`.
   * Native clients send no origin and need no entry.
   */
  TRUSTED_ORIGINS: z
    .string()
    .default("")
    .transform((value, context) => {
      const patterns: OriginPattern[] = [];
      for (const source of value.split(",").map((part) => part.trim()).filter((part) => part.length > 0)) {
        try {
          patterns.push(parseOriginPattern(source));
        } catch (error) {
          context.addIssue({
            code: "custom",
            message: error instanceof Error ? error.message : String(error)
          });
        }
      }

      return patterns;
    })
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
    trustProxy: environment.TRUST_PROXY,
    trustedOrigins: environment.TRUSTED_ORIGINS
  };
})();
