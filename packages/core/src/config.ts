import { z } from "zod";

const EnvironmentSchema = z.object({
  /** PostgreSQL connection string used by the database module. */
  DATABASE_URL: z.url(),
  /**
   * Secret for signing stream proxy tokens. Tokens authorize the proxy to fetch
   * one upstream URL, so a leaked secret lets anyone use the proxy.
   */
  STREAM_SIGNING_SECRET: z.string().min(32)
});

/**
 * Validated process configuration for the core.
 *
 * @remarks
 * Parsed once when first imported. A missing or malformed variable throws at
 * startup instead of failing later inside a request.
 */
export const config = (() => {
  const environment = EnvironmentSchema.parse(process.env);

  return {
    databaseUrl: environment.DATABASE_URL,
    streamSigningSecret: environment.STREAM_SIGNING_SECRET
  };
})();
